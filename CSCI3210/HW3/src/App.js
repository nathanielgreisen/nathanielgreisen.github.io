import { useEffect, useRef, useState } from "react";
import "./App.css";
import Food from "./components/Food";
import Snake from "./components/Snake";

/* Added functions:
 1: Improved Snake movement
    - I thought the movement felt blocky, so I added a type of queue where
    - if the user pressed two arrow keys quickly, it would add the second
    - one to the queue, and would then happen on the next frame. This
    - made movement feel much smoother. The snake also can no longer
    - reverse directions and pass through itself.
 2: Added game settings copied from my last project allowing the user
    - to change the size of the game and the amount of fruit on it
*/
const initialSnake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
const oppositeDirections = {
  ArrowUp: "ArrowDown", ArrowRight: "ArrowLeft",
  ArrowDown: "ArrowUp", ArrowLeft: "ArrowRight",
};

export function generateFruit(size, count, snake, existing = []) {
  const key = ({ x, y }) => y * size + x;
  const occupied = new Set(snake.map(key));
  const used = new Set(existing.map(key));
  const empty = [];
  const beneathSnake = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = { x, y };
      if (!used.has(key(cell))) {
        (occupied.has(key(cell)) ? beneathSnake : empty).push(cell);
      }
    }
  }
  const fruits = [...existing];
  for (const pool of [empty, beneathSnake]) {
    while (pool.length && fruits.length < count) {
      const index = Math.floor(Math.random() * pool.length);
      fruits.push(pool[index]);
      pool[index] = pool[pool.length - 1];
      pool.pop();
    }
  }
  return fruits;
}

function App() {
  const [fieldSize, setFieldSize] = useState(25);
  const [fruitCount, setFruitCount] = useState(1);
  const [snake, setSnake] = useState(initialSnake);
  const [foodPositions, setFoodPositions] = useState([]);
  const [isStarted, setIsStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const playgroundRef = useRef();
  const settingsRef = useRef();
  const directionQueue = useRef([]);
  const currentDirection = useRef("ArrowRight");

  useEffect(() => { settingsRef.current.showModal(); }, []);

  const startGame = () => {
    setSnake(initialSnake);
    setFoodPositions(generateFruit(fieldSize, fruitCount, initialSnake));
    setGameOver(false);
    setHasWon(false);
    currentDirection.current = "ArrowRight";
    directionQueue.current = [];
    settingsRef.current.close();
    setIsStarted(true);
    playgroundRef.current.focus();
  };

  const handleKeyDown = (event) => {
    if (!isStarted || !oppositeDirections[event.key]) return;
    event.preventDefault();
    const lastQueuedDirection = directionQueue.current[directionQueue.current.length - 1]
      ?? currentDirection.current;
    if (event.key === lastQueuedDirection ||
      event.key === oppositeDirections[lastQueuedDirection]) return;
    directionQueue.current.push(event.key);
  };

  useEffect(() => {
    if (!isStarted) return;
    const interval = setInterval(() => {
      const direction = directionQueue.current.shift() ?? currentDirection.current;
      currentDirection.current = direction;
      const head = { ...snake[snake.length - 1] };
      switch (direction) {
        case "ArrowUp": head.y--; break;
        case "ArrowRight": head.x++; break;
        case "ArrowDown": head.y++; break;
        case "ArrowLeft": head.x--; break;
        default: break;
      }
      const eatsFruit = foodPositions.some(({ x, y }) => x === head.x && y === head.y);
      const nextSnake = [...snake, head];
      if (!eatsFruit) nextSnake.shift();
      if (head.x < 0 || head.x >= fieldSize || head.y < 0 || head.y >= fieldSize ||
        nextSnake.slice(0, -1).some(({ x, y }) => x === head.x && y === head.y)) {
        setGameOver(true);
        setIsStarted(false);
        directionQueue.current = [];
        return;
      }
      setSnake(nextSnake);
      if (nextSnake.length === fieldSize * fieldSize) {
        setHasWon(true);
        setGameOver(true);
        setIsStarted(false);
        directionQueue.current = [];
      } else if (eatsFruit) {
        const remaining = foodPositions.filter(({ x, y }) => x !== head.x || y !== head.y);
        setFoodPositions(generateFruit(fieldSize, fruitCount, nextSnake, remaining));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isStarted, snake, foodPositions, fieldSize, fruitCount]);

  return <>
    <dialog id="settings-dialog" ref={settingsRef} aria-labelledby="settings-title"
      onCancel={(event) => event.preventDefault()}>
      <h2 id="settings-title">Game settings</h2>
      <div className="slider-container">
        <label htmlFor="field-size">Game screen size ({fieldSize}×{fieldSize}):</label>
        <input type="range" id="field-size" min="15" max="35" value={fieldSize}
          onChange={(event) => {
            const size = Number(event.target.value);
            setFieldSize(size);
            setFruitCount((count) => Math.min(count, size * size));
          }} />
      </div>
      <div className="slider-container">
        <label htmlFor="fruit-count">Amount of fruit ({fruitCount}):</label>
        <input type="range" id="fruit-count" min="1" max={fieldSize * fieldSize}
          value={fruitCount} onChange={(event) => setFruitCount(Number(event.target.value))} />
      </div>
      <div className="settings-buttons">
        <button type="button" onClick={startGame}>Play singleplayer</button>
        <button type="button">Create multiplayer game</button>
        <button type="button">Join multiplayer game</button>
      </div>
    </dialog>
    <div className="App" onKeyDown={handleKeyDown} ref={playgroundRef} tabIndex={0}
      aria-label="Snake game field" style={{ width: `${fieldSize * 20}px` }}>
      {(isStarted || gameOver) && <div className="count">score: {snake.length - 3}</div>}
      {gameOver && <>
        <div className="game-over text">{hasWon ? "You win!" : "Game Over!"}</div>
        <button type="button" onClick={startGame}>Restart</button>
        <button className="change-settings" type="button"
          onClick={() => settingsRef.current.showModal()}>Game settings</button>
      </>}
      <Snake snake={snake} fieldSize={fieldSize} />
      {!gameOver && foodPositions.map((position) =>
        <Food key={`${position.x},${position.y}`} position={position} fieldSize={fieldSize} />)}
    </div>
    <div className="arrow-msg text">Press arrow keys to play!</div>
  </>;
}

export default App;
