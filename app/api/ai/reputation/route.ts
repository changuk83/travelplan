import { checkLocalAiRequest } from "../chat/route";
import { handlePlaceReputation } from "../../../../server/place-reputation";

export async function POST(request: Request) {
  return (
    checkLocalAiRequest(request) ??
    handlePlaceReputation(request, {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    })
  );
}
