function Snake({ snake, fieldSize }) {
  return snake.map((box, i) => (
    <div key={i} className="snake-cell" style={{
      left: `${box.x * 100 / fieldSize}%`,
      top: `${box.y * 100 / fieldSize}%`,
      width: `${100 / fieldSize}%`,
      height: `${100 / fieldSize}%`,
    }} />
  ));
}

export default Snake;
