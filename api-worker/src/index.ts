type Env = {
  DB: D1Database;
  SEARCH_RATE_LIMITER: RateLimiter;
  ROUTE_RATE_LIMITER: RateLimiter;
  STATE_READ_RATE_LIMITER: RateLimiter;
  STATE_WRITE_RATE_LIMITER: RateLimiter;
  ALLOWED_ORIGINS: string;
  NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: string;
  NAVER_MAP_CLIENT_SECRET: string;
  NAVER_SEARCH_CLIENT_ID: string;
  NAVER_SEARCH_CLIENT_SECRET: string;
  KAKAO_REST_API_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
};

type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type Place = { id:string; name:string; category:string; address:string; longitude:number; latitude:number; link?:string; memo?:string; savedCategory?:string; savedCategories?:string[] };
type Day = { id:string; label:string; date:string; dateValue?:string; start:{name:string;longitude:number;latitude:number}; goal:{name:string;longitude:number;latitude:number}; places:Place[]; candidates?:Record<string,Place[]> };
type Trip = { id:string; title:string; days:Day[]; updatedAt:number };

const DEFAULT_USER_ID = "1";
const ROUTE_CACHE_SECONDS = 60 * 60 * 6;

const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json; charset=utf-8", ...(init.headers ?? {}) } });
const clean = (value = "") => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const coordinate = (value?: string) => { const n = Number(value); return Math.abs(n) > 180 ? n / 10_000_000 : n; };
const distanceKm=(from:{longitude:number;latitude:number},to:{longitude:number;latitude:number})=>{const radius=6371;const radians=(value:number)=>value*Math.PI/180;const latitude=radians(to.latitude-from.latitude);const longitude=radians(to.longitude-from.longitude);const value=Math.sin(latitude/2)**2+Math.cos(radians(from.latitude))*Math.cos(radians(to.latitude))*Math.sin(longitude/2)**2;return radius*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));};
const validDevice = (value: string | null) => value && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : null;

async function enforceRateLimit(request: Request, limiter: RateLimiter) {
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await limiter.limit({ key: clientIp });
  return success ? null : json(
    { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
    { status: 429, headers: { "retry-after": "60" } },
  );
}

function cors(request: Request, env: Env) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  return allowed.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET,PUT,POST,OPTIONS", "access-control-allow-headers": "content-type,x-gildam-device", vary: "Origin" } : {};
}

function routeCacheRequest(request:Request,points:Array<{longitude:number;latitude:number}>,scope?:{tripId?:string;dayId?:string;mode?:"schedule"|"preview"}){
  const url=new URL("/__gildam-cache/routes/v2",request.url);
  url.searchParams.set("user",DEFAULT_USER_ID);
  url.searchParams.set("trip",scope?.tripId??"unscoped");
  url.searchParams.set("day",scope?.dayId??"unscoped");
  url.searchParams.set("mode",scope?.mode==="preview"?"preview":"schedule");
  url.searchParams.set("option","traoptimal");
  url.searchParams.set("points",points.map((point)=>`${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`).join("|"));
  return new Request(url,{method:"GET"});
}

const samePoint=(a:{longitude:number;latitude:number},b:{longitude:number;latitude:number})=>Math.abs(a.longitude-b.longitude)<0.000001&&Math.abs(a.latitude-b.latitude)<0.000001;
function compactRoute(points:Array<{longitude:number;latitude:number}>){const compact=[points[0]];const duplicateLegs:boolean[]=[];for(let index=1;index<points.length;index++){const duplicate=samePoint(points[index-1],points[index]);duplicateLegs.push(duplicate);if(!duplicate)compact.push(points[index]);}return{compact,duplicateLegs};}

async function directions(request: Request, env: Env, ctx:ExecutionContext) {
  const { waypoints = [], start, goal, cacheScope } = await request.json() as { waypoints?:Place[]; start?:Place; goal?:Place; cacheScope?:{userId?:number;tripId?:string;dayId?:string;mode?:"schedule"|"preview"} };
  if (!env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || !env.NAVER_MAP_CLIENT_SECRET) return json({error:"지도 API 키가 설정되지 않았습니다."},{status:500});
  if (waypoints.length > 30) return json({error:"경유지는 최대 30곳까지 추가할 수 있습니다."},{status:400});
  const points = [start ?? {longitude:127.095,latitude:37.322}, ...waypoints, goal ?? {longitude:128.467,latitude:38.378}];
  const cacheRequest=routeCacheRequest(request,points,cacheScope);
  const cached=await caches.default.match(cacheRequest);
  if(cached){const headers=new Headers(cached.headers);headers.set("x-gildam-route-cache","HIT");return new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers});}
  const {compact:routePoints,duplicateLegs}=compactRoute(points);
  if(routePoints.length===1){const response=json({path:[[routePoints[0].longitude,routePoints[0].latitude]],summary:{distance:0,duration:0},legs:duplicateLegs.map(()=>({distance:0,duration:0}))},{headers:{"cache-control":`public, max-age=${ROUTE_CACHE_SECONDS}`,"x-gildam-route-cache":"MISS"}});ctx.waitUntil(caches.default.put(cacheRequest,response.clone()));return response;}
  const chunks:Place[][]=[];
  for(let index=0;index<routePoints.length-1;index+=6)chunks.push(routePoints.slice(index,Math.min(index+7,routePoints.length)) as Place[]);
  const routes=await Promise.all(chunks.map(async(points)=>{
    const url = new URL("https://maps.apigw.ntruss.com/map-direction/v1/driving");
    url.searchParams.set("start",`${points[0].longitude},${points[0].latitude}`);
    url.searchParams.set("goal",`${points.at(-1)!.longitude},${points.at(-1)!.latitude}`);
    url.searchParams.set("option","traoptimal");
    const intermediates=points.slice(1,-1);
    if(intermediates.length)url.searchParams.set("waypoints",intermediates.map((p)=>`${p.longitude},${p.latitude}`).join("|"));
    const response=await fetch(url,{headers:{"x-ncp-apigw-api-key-id":env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,"x-ncp-apigw-api-key":env.NAVER_MAP_CLIENT_SECRET,accept:"application/json"}});
    const data=await response.json() as any;
    if(!response.ok)throw new Error(data.message||"경로를 계산하지 못했습니다.");
    return data.route?.traoptimal?.[0];
  }));
  const path:number[][]=[];const calculatedLegs:{distance:number;duration:number}[]=[];let totalDistance=0;let totalDuration=0;
  routes.forEach((route,index)=>{path.push(...(index?(route?.path??[]).slice(1):route?.path??[]));let distance=0;let duration=0;for(const guide of route?.guide??[]){distance+=guide.distance??0;duration+=guide.duration??0;if(guide.type===87||guide.type===88){calculatedLegs.push({distance,duration});distance=0;duration=0;}}if(distance||duration)calculatedLegs.push({distance,duration});totalDistance+=route?.summary?.distance??0;totalDuration+=route?.summary?.duration??0;});
  let calculatedIndex=0;const legs=duplicateLegs.map((duplicate)=>duplicate?{distance:0,duration:0}:calculatedLegs[calculatedIndex++]??{distance:0,duration:0});
  const response=json({path,summary:{distance:totalDistance,duration:totalDuration},legs},{headers:{"cache-control":`public, max-age=${ROUTE_CACHE_SECONDS}`,"x-gildam-route-cache":"MISS"}});
  ctx.waitUntil(caches.default.put(cacheRequest,response.clone()));
  return response;
}

async function search(request: Request, env: Env) {
  const params=new URL(request.url).searchParams;const q = params.get("q")?.trim();
  if (!q || q.length < 2) return json({error:"두 글자 이상 입력해 주세요."},{status:400});
  const fromLng=params.get("fromLng"),fromLat=params.get("fromLat"),toLng=params.get("toLng"),toLat=params.get("toLat"),mainLng=params.get("mainLng"),mainLat=params.get("mainLat");const from={longitude:Number(fromLng),latitude:Number(fromLat)};const to={longitude:Number(toLng),latitude:Number(toLat)};const main={longitude:Number(mainLng),latitude:Number(mainLat)};const hasFrom=fromLng!==null&&fromLat!==null&&Number.isFinite(from.longitude)&&Number.isFinite(from.latitude);const hasTo=toLng!==null&&toLat!==null&&Number.isFinite(to.longitude)&&Number.isFinite(to.latitude);const hasMain=mainLng!==null&&mainLat!==null&&Number.isFinite(main.longitude)&&Number.isFinite(main.latitude);
  const kakaoPlaces:Place[]=[];if(env.KAKAO_REST_API_KEY&&hasFrom){try{const centers=[...(hasTo?[from,to]:[from]),...(hasMain?[main]:[])];const responses=await Promise.all(centers.map(async(center)=>{const kakaoUrl=new URL("https://dapi.kakao.com/v2/local/search/keyword.json");kakaoUrl.searchParams.set("query",q);kakaoUrl.searchParams.set("x",String(center.longitude));kakaoUrl.searchParams.set("y",String(center.latitude));kakaoUrl.searchParams.set("radius","20000");kakaoUrl.searchParams.set("size","15");kakaoUrl.searchParams.set("sort","distance");return fetch(kakaoUrl,{headers:{authorization:`KakaoAK ${env.KAKAO_REST_API_KEY}`}});}));for(const response of responses){if(!response.ok)continue;const data=await response.json() as any;for(const item of data.documents??[]){if(kakaoPlaces.some((place)=>place.id===`kakao-${item.id}`))continue;kakaoPlaces.push({id:`kakao-${item.id}`,name:item.place_name,category:item.category_name||item.category_group_name||"장소",address:item.road_address_name||item.address_name||"",longitude:Number(item.x),latitude:Number(item.y),link:item.place_url||""});}}}catch{}if(hasTo)kakaoPlaces.sort((a,b)=>(distanceKm(from,a)+distanceKm(a,to))-(distanceKm(from,b)+distanceKm(b,to)));else kakaoPlaces.sort((a,b)=>distanceKm(from,a)-distanceKm(from,b));if(kakaoPlaces.length>=10)return json({source:"kakao",places:kakaoPlaces.slice(0,20)});}
  if(!env.NAVER_SEARCH_CLIENT_ID||!env.NAVER_SEARCH_CLIENT_SECRET){if(kakaoPlaces.length)return json({source:"kakao",places:kakaoPlaces});return json({error:"장소 검색 API 키가 설정되지 않았습니다."},{status:500});}
  const localUrl = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
  localUrl.searchParams.set("query",q);localUrl.searchParams.set("display","5");localUrl.searchParams.set("format","json");
  const localResponse = await fetch(localUrl,{headers:{"X-NCP-APIGW-API-KEY-ID":env.NAVER_SEARCH_CLIENT_ID,"X-NCP-APIGW-API-KEY":env.NAVER_SEARCH_CLIENT_SECRET}});
  const localData = await localResponse.json() as any;
  if(!localResponse.ok)return json({error:localData.message||`지역 검색 실패 (${localResponse.status})`},{status:localResponse.status});
  const localPlaces=(localData.items??[]).map((item:any,index:number)=>({id:`local-${index}-${item.mapx}`,name:clean(item.title),category:clean(item.category),address:item.roadAddress||item.address||"",longitude:coordinate(item.mapx),latitude:coordinate(item.mapy),link:item.link||""}));
  if(kakaoPlaces.length){const combined=[...kakaoPlaces];for(const place of localPlaces){const duplicate=combined.some((item)=>clean(item.name).replace(/\s/g,"")===clean(place.name).replace(/\s/g,"")||(Boolean(item.address)&&item.address===place.address));if(!duplicate)combined.push(place);}if(hasTo)combined.sort((a,b)=>(distanceKm(from,a)+distanceKm(a,to))-(distanceKm(from,b)+distanceKm(b,to)));else combined.sort((a,b)=>distanceKm(from,a)-distanceKm(from,b));return json({source:localPlaces.length?"mixed":"kakao",places:combined.slice(0,20)});}
  if(localPlaces.length)return json({source:"local",places:localPlaces});

  if(!env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID||!env.NAVER_MAP_CLIENT_SECRET)return json({error:"주소 검색용 지도 API 키가 설정되지 않았습니다."},{status:500});
  const geocodeUrl=new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
  geocodeUrl.searchParams.set("query",q);geocodeUrl.searchParams.set("count","5");
  const geocodeResponse=await fetch(geocodeUrl,{headers:{"x-ncp-apigw-api-key-id":env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,"x-ncp-apigw-api-key":env.NAVER_MAP_CLIENT_SECRET,accept:"application/json"}});
  const geocodeData=await geocodeResponse.json() as any;
  if(!geocodeResponse.ok)return json({error:geocodeData.errorMessage||geocodeData.message||`주소 검색 실패 (${geocodeResponse.status})`},{status:geocodeResponse.status});
  return json({source:"geocoding",places:(geocodeData.addresses??[]).map((item:any,index:number)=>({id:`address-${index}-${item.x}`,name:item.roadAddress||item.jibunAddress||q,category:"주소",address:item.jibunAddress||item.roadAddress||"",longitude:Number(item.x),latitude:Number(item.y),link:""}))});
}

async function googleRouteSearch(request:Request,env:Env){
  if(!env.GOOGLE_MAPS_API_KEY)return json({error:"Google 서버 API 키가 아직 설정되지 않았습니다."},{status:503});
  const {query,start,goal}=await request.json() as {query?:string;start?:{latitude:number;longitude:number};goal?:{latitude:number;longitude:number}};
  if(!query?.trim()||!start||!goal)return json({error:"검색어와 출발·도착 좌표가 필요합니다."},{status:400});
  const routeResponse=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{method:"POST",headers:{"content-type":"application/json","X-Goog-Api-Key":env.GOOGLE_MAPS_API_KEY,"X-Goog-FieldMask":"routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"},body:JSON.stringify({origin:{location:{latLng:start}},destination:{location:{latLng:goal}},travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE"})});
  const routeData=await routeResponse.json() as any;if(!routeResponse.ok)return json({error:routeData.error?.message||"Google 경로를 계산하지 못했습니다."},{status:routeResponse.status});
  const route=routeData.routes?.[0];const encodedPolyline=route?.polyline?.encodedPolyline;if(!encodedPolyline)return json({error:"Google 경로 결과가 없습니다."},{status:404});
  const placesResponse=await fetch("https://places.googleapis.com/v1/places:searchText",{method:"POST",headers:{"content-type":"application/json","X-Goog-Api-Key":env.GOOGLE_MAPS_API_KEY,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,routingSummaries"},body:JSON.stringify({textQuery:query.trim(),languageCode:"ko",maxResultCount:10,searchAlongRouteParameters:{polyline:{encodedPolyline}},routingParameters:{origin:start}})});
  const placesData=await placesResponse.json() as any;if(!placesResponse.ok)return json({error:placesData.error?.message||"Google 장소를 검색하지 못했습니다."},{status:placesResponse.status});
  const parseSeconds=(value?:string)=>Number(value?.replace("s","")??0);const places=(placesData.places??[]).map((place:any,index:number)=>{const legs=placesData.routingSummaries?.[index]?.legs??[];return{id:place.id,name:place.displayName?.text??"이름 없는 장소",address:place.formattedAddress??"",category:place.primaryTypeDisplayName?.text??"장소",location:place.location,detourDistanceMeters:Math.max(0,legs.reduce((sum:number,leg:any)=>sum+(leg.distanceMeters??0),0)-(route.distanceMeters??0)),detourDurationSeconds:Math.max(0,legs.reduce((sum:number,leg:any)=>sum+parseSeconds(leg.duration),0)-parseSeconds(route.duration))}});
  return json({encodedPolyline,route:{distanceMeters:route.distanceMeters??0,durationSeconds:parseSeconds(route.duration)},places});
}

async function getState(deviceId:string, env:Env) {
  void deviceId;
  const userId=DEFAULT_USER_ID;
  const [tripRows,dayRows,stopRows,candidateRows,savedRows,categoryRows]=await env.DB.batch([
    env.DB.prepare("SELECT * FROM trips WHERE user_id=? ORDER BY position").bind(userId),
    env.DB.prepare("SELECT d.* FROM trip_days d JOIN trips t ON t.id=d.trip_id WHERE t.user_id=? ORDER BY d.position").bind(userId),
    env.DB.prepare("SELECT s.* FROM stops s JOIN trip_days d ON d.id=s.day_id JOIN trips t ON t.id=d.trip_id WHERE t.user_id=? ORDER BY s.position").bind(userId),
    env.DB.prepare("SELECT c.* FROM stop_candidates c JOIN stops s ON s.id=c.stop_id JOIN trip_days d ON d.id=s.day_id JOIN trips t ON t.id=d.trip_id WHERE t.user_id=? ORDER BY c.position").bind(userId),
    env.DB.prepare("SELECT * FROM saved_places WHERE user_id=? ORDER BY position").bind(userId),
    env.DB.prepare("SELECT * FROM saved_categories WHERE user_id=? ORDER BY position").bind(userId),
  ]);
  const place = (row:any):Place=>{let savedCategories:string[]|undefined;if(row.saved_category){try{const parsed=JSON.parse(row.saved_category);savedCategories=Array.isArray(parsed)?parsed:[row.saved_category]}catch{savedCategories=[row.saved_category]}}return {id:row.place_id,name:row.name,category:row.category,address:row.address,longitude:row.longitude,latitude:row.latitude,...(row.link?{link:row.link}:{}),...(row.memo?{memo:row.memo}:{}),...(savedCategories?.length?{savedCategories}:{})}};
  const candidatesByStop=new Map<string,Place[]>();for(const row of candidateRows.results as any[]){const list=candidatesByStop.get(row.stop_id)??[];list.push(place(row));candidatesByStop.set(row.stop_id,list);}
  const stopsByDay=new Map<string,Array<{row:any;place:Place}>>();for(const row of stopRows.results as any[]){const list=stopsByDay.get(row.day_id)??[];list.push({row,place:place(row)});stopsByDay.set(row.day_id,list);}
  const daysByTrip=new Map<string,Day[]>();for(const row of dayRows.results as any[]){const stopList=stopsByDay.get(row.id)??[];const candidates:Record<string,Place[]>={};for(const stop of stopList){const list=candidatesByStop.get(stop.row.id);if(list?.length)candidates[stop.place.id]=list;}const [storedDateValue,storedDateLabel]=String(row.date_label).includes("|")?String(row.date_label).split("|",2):[undefined,row.date_label];const day:Day={id:row.id,label:row.label,date:storedDateLabel,...(storedDateValue?{dateValue:storedDateValue}:{}),start:{name:row.start_name,longitude:row.start_longitude,latitude:row.start_latitude},goal:{name:row.goal_name,longitude:row.goal_longitude,latitude:row.goal_latitude},places:stopList.map((item)=>item.place),...(Object.keys(candidates).length?{candidates}:{})};const list=daysByTrip.get(row.trip_id)??[];list.push(day);daysByTrip.set(row.trip_id,list);}
  const trips=(tripRows.results as any[]).map((row)=>({id:row.id,title:row.title,days:daysByTrip.get(row.id)??[],updatedAt:row.updated_at}));
  return json({trips,savedPlaces:(savedRows.results as any[]).map(place),savedCategories:(categoryRows.results as any[]).map((row)=>row.name)});
}

async function putState(deviceId:string, request:Request, env:Env) {
  const body=await request.json() as {trips?:Trip[];savedPlaces?:Place[];savedCategories?:string[]};const trips=body.trips??[];const saved=body.savedPlaces??[];const categories=body.savedCategories??[];const now=Date.now();
  if(trips.length>30||saved.length>500||categories.length>50)return json({error:"저장 가능한 데이터 범위를 초과했습니다."},{status:400});
  const userId=DEFAULT_USER_ID;
  const statements=[
    env.DB.prepare("INSERT INTO devices(id,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at").bind(deviceId,now,now),
    env.DB.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at").bind(userId,"기본 사용자",now,now),
    env.DB.prepare("INSERT INTO user_devices(device_id,user_id,linked_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET user_id=excluded.user_id").bind(deviceId,userId,now),
    env.DB.prepare("DELETE FROM trips WHERE user_id=?").bind(userId),env.DB.prepare("DELETE FROM saved_places WHERE user_id=?").bind(userId),env.DB.prepare("DELETE FROM saved_categories WHERE user_id=?").bind(userId)
  ];
  for(let ti=0;ti<trips.length;ti++){const trip=trips[ti];statements.push(env.DB.prepare("INSERT INTO trips(id,device_id,user_id,title,position,updated_at) VALUES(?,?,?,?,?,?)").bind(trip.id,deviceId,userId,trip.title,ti,trip.updatedAt||now));for(let di=0;di<trip.days.length;di++){const day=trip.days[di];const storedDate=day.dateValue?`${day.dateValue}|${day.date}`:day.date;statements.push(env.DB.prepare("INSERT INTO trip_days(id,trip_id,label,date_label,position,start_name,start_longitude,start_latitude,goal_name,goal_longitude,goal_latitude) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(day.id,trip.id,day.label,storedDate,di,day.start.name,day.start.longitude,day.start.latitude,day.goal.name,day.goal.longitude,day.goal.latitude));for(let si=0;si<day.places.length;si++){const p=day.places[si];const stopId=`${day.id}:${p.id}`;statements.push(env.DB.prepare("INSERT INTO stops(id,day_id,place_id,position,name,category,address,longitude,latitude,link,memo) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(stopId,day.id,p.id,si,p.name,p.category,p.address,p.longitude,p.latitude,p.link??null,p.memo??null));for(let ci=0;ci<(day.candidates?.[p.id]??[]).length;ci++){const c=day.candidates![p.id][ci];statements.push(env.DB.prepare("INSERT INTO stop_candidates(id,stop_id,place_id,position,name,category,address,longitude,latitude,link,memo) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(`${stopId}:${c.id}`,stopId,c.id,ci,c.name,c.category,c.address,c.longitude,c.latitude,c.link??null,c.memo??null));}}}}
  for(let i=0;i<saved.length;i++){const p=saved[i];const placeCategories=p.savedCategories?.length?p.savedCategories:p.savedCategory?[p.savedCategory]:[];statements.push(env.DB.prepare("INSERT INTO saved_places(id,device_id,user_id,place_id,position,name,category,address,longitude,latitude,link,memo,saved_category) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`${deviceId}:${p.id}`,deviceId,userId,p.id,i,p.name,p.category,p.address,p.longitude,p.latitude,p.link??null,p.memo??null,placeCategories.length?JSON.stringify([...new Set(placeCategories)]):null));}
  for(let i=0;i<categories.length;i++){const name=categories[i].trim().slice(0,40);if(name)statements.push(env.DB.prepare("INSERT INTO saved_categories(id,user_id,name,position) VALUES(?,?,?,?)").bind(`${userId}:${i}`,userId,name,i));}
  await env.DB.batch(statements);return json({ok:true,updatedAt:now});
}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext){const headers=cors(request,env);if(request.method==="OPTIONS")return new Response(null,{status:204,headers});try{const url=new URL(request.url);let response:Response;if(url.pathname==="/health")response=json({ok:true});else if(url.pathname==="/api/routes"&&request.method==="POST")response=(await enforceRateLimit(request,env.ROUTE_RATE_LIMITER))??await directions(request,env,ctx);else if(url.pathname==="/api/google/route-search"&&request.method==="POST")response=(await enforceRateLimit(request,env.ROUTE_RATE_LIMITER))??await googleRouteSearch(request,env);else if(url.pathname==="/api/places/search"&&request.method==="GET")response=(await enforceRateLimit(request,env.SEARCH_RATE_LIMITER))??await search(request,env);else if(url.pathname==="/api/state"){const deviceId=validDevice(request.headers.get("x-gildam-device"));const limiter=request.method==="GET"?env.STATE_READ_RATE_LIMITER:request.method==="PUT"?env.STATE_WRITE_RATE_LIMITER:null;const blocked=limiter?await enforceRateLimit(request,limiter):null;response=blocked??(!deviceId?json({error:"기기 식별자가 필요합니다."},{status:400}):request.method==="GET"?await getState(deviceId,env):request.method==="PUT"?await putState(deviceId,request,env):json({error:"지원하지 않는 요청입니다."},{status:405}));}else response=json({error:"찾을 수 없습니다."},{status:404});const next=new Headers(response.headers);for(const [k,v] of Object.entries(headers))next.set(k,v);next.set("access-control-expose-headers","x-gildam-route-cache");return new Response(response.body,{status:response.status,headers:next});}catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:"서버 오류가 발생했습니다."}),{status:500,headers:{"content-type":"application/json",...headers}})}}};
