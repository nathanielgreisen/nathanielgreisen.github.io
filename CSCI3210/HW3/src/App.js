import { useEffect, useRef, useState } from "react";
import "./App.css";
import Food from "./components/Food";
import Snake from "./components/Snake";

/* Added functions:
 1: Improved Snake movement
    - I thought the movement felt blocky, so I added a "queue" where
    - if the user pressed two arrow keys quickly, it would add the second
    - one to the queue, and would then happen on the next frame. This
    - made movement feel much smoother. The snake also can no longer
    - reverse directions and pass through itself.
 2: 
*/
const randomFoodPosition = () => {
  const pos = { x: 0, y: 0 };
  let x = Math.floor(Math.random() * 96);
  let y = Math.floor(Math.random() * 96);
  pos.x = x - (x % 4);
  pos.y = y - (y % 4);
  return pos;
};

const initialSnake = {
  snake: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 8, y: 0 },
  ],
  direction: "ArrowRight",
  speed: 100,
};

function App() {
  const [snake, setSnake] = useState(initialSnake.snake);
  const [lastDirection, setLastDirection] = useState(initialSnake.direction);
  const [foodPosition, setFoodPosition] = useState(randomFoodPosition);
  const [isStarted, setIsStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const playgroundRef = useRef();
  const oppositeDirections = {
      ArrowUp: "ArrowDown",
      ArrowRight: "ArrowLeft",
      ArrowDown: "ArrowUp",
      ArrowLeft: "ArrowRight",
    };
  const directionQueue = useRef([]);
  const currentDirection = useRef(initialSnake.direction);

  const handleKeyDown = (event) => {
    const nextDirection = event.key;
    
    if (!oppositeDirections[nextDirection]){
      return;
    }

    const lastQueuedDirection = 
      directionQueue.current[directionQueue.current.length -1] ??
      currentDirection.current;

    if ( // ignore opposites and duplicate directions
      nextDirection === lastQueuedDirection ||
      nextDirection === oppositeDirections[lastQueuedDirection]
    ) {
      return;
    }
    

    directionQueue.current.push(nextDirection);
  };

  useEffect(() => {
    if (!isStarted) return;

    const interval = setInterval(move, initialSnake.speed);
    return () => clearInterval(interval);
  });

  const move = () => {
    const nextDirection = 
      directionQueue.current.shift() ?? currentDirection.current;

    currentDirection.current = nextDirection;
    setLastDirection(nextDirection);

    const tmpSnake = [...snake];
    let x = tmpSnake[tmpSnake.length - 1].x;
    let y = tmpSnake[tmpSnake.length - 1].y;

    switch (nextDirection) {
      case "ArrowUp":
        y -= 4;
        break;
      case "ArrowRight":
        x += 4;
        break;
      case "ArrowDown":
        y += 4;
        break;
      case "ArrowLeft":
        x -= 4;
        break;
      default:
        break;
    }

    if (x > 100 || x < 0 || y > 100 || y < 0) {
      setGameOver(true);
      setIsStarted(false);
      directionQueue.current = [];
      return;
    }

    tmpSnake.push({
      x,
      y,
    });
    if (x !== foodPosition.x || y !== foodPosition.y) tmpSnake.shift();

    if (tmpSnake.slice(0, -1).some((part) => part.x === x && part.y === y)) {
      setGameOver(true);
      setIsStarted(false);
      directionQueue.current = [];
      return;
    }

    if (x === foodPosition.x && y === foodPosition.y) {
      setFoodPosition(randomFoodPosition());
    }
    setSnake(tmpSnake);
  };

  return (
    <div
      className="App"
      onKeyDown={handleKeyDown}
      ref={playgroundRef}
      tabIndex={0}
    >
      {isStarted && <div className="count"> score: {snake.length - 3}</div>}

      {!isStarted && !gameOver && (
        <>
          <button
            onClick={() => {
              setIsStarted(true);
              playgroundRef.current.focus();
            }}
            type="submit"
          >
            Start
          </button>
          <div className="arrow-msg text">Press Arrows keys to play!</div>
        </>
      )}
      {gameOver && (
        <>
          <div className="game-over text">Game Over!</div>
          <button
            onClick={() => {
              setIsStarted(true);
              setGameOver(false);
              setSnake(initialSnake.snake);
              setLastDirection(initialSnake.direction);
              playgroundRef.current.focus();
              currentDirection.current = initialSnake.direction;
              directionQueue.current = [];
            }}
            type="submit"
          >
            Restart
          </button>
        </>
      )}
      <Snake snake={snake} lastDirection={lastDirection} />
      {!gameOver && (
        <>
          <Food position={foodPosition} />
        </>
      )}
    </div>
  );
}

export default App;
