export default function TimelineInsertion({
  index,
  disabled,
  onAdd,
}: {
  index: number;
  disabled: boolean;
  onAdd: (index: number) => void;
}) {
  return (
    <div className="timeline-insertion">
      <button
        onClick={() => onAdd(index)}
        disabled={disabled}
        aria-label={`${index === 0 ? "출발지 다음" : `${index}번째 장소 다음`}에 장소 추가`}
      >
        <span>＋</span>
        <strong>{disabled ? "경유지 최대 30곳" : "장소 추가"}</strong>
      </button>
    </div>
  );
}
