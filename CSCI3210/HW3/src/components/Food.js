function Food({ position, fieldSize }) {
  return <div className="food-cell" style={{
    left: `${position.x * 100 / fieldSize}%`,
    top: `${position.y * 100 / fieldSize}%`,
    width: `${100 / fieldSize}%`,
    height: `${100 / fieldSize}%`,
  }} />;
}

export default Food;
