import { useEffect, useRef, useState } from "react";
import Peer from "peerjs";
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
 2: Game Settings menu
    - I added a settings menu that allows the user to change the size of the
    - game and the amount of fruit on it. The user can also choose to play
    - singleplayer or multiplayer, and can choose their snake color.
 3: Fruit generation
    - Users can change how many fruit on the field, calculated by size of the field
 4: Game size
    - Users can change the size of the game field
 5: Multiplayer
    - This was largely stolen from my last homework, using the same PeerJS library.
    - It works as a host and a guest, and they connect directly to each other to play.
    - If they collide, the game ends and they can rematch
*/
export const COLORS = [
    { name: "Yellow", value: "#e7da3d" },
    { name: "Pink", value: "#e73d9f" },
    { name: "Green", value: "#62df80" },
    { name: "Orange", value: "#ff994a" },
    { name: "Purple", value: "#ad83ff" },
];
export const DIRECTIONS = {
    ArrowUp: { x: 0, y: -1, opposite: "ArrowDown" },
    ArrowRight: { x: 1, y: 0, opposite: "ArrowLeft" },
    ArrowDown: { x: 0, y: 1, opposite: "ArrowUp" },
    ArrowLeft: { x: -1, y: 0, opposite: "ArrowRight" },
};
const cellKey = ({ x, y }, size) => y * size + x;
const sameCell = (a, b) => a.x === b.x && a.y === b.y;

export function generateFruit(size, count, snakes, existing = []) {
    const occupied = new Set(snakes.flat().map((cell) => cellKey(cell, size)));
    const used = new Set(existing);
    const empty = [];
    const beneathSnake = [];
    for (let cell = 0; cell < size * size; cell++) {
        if (!used.has(cell)) (occupied.has(cell) ? beneathSnake : empty).push(cell);
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

export function createGame(size, fruitCount, colors, round = 1) {
    const players = colors.map((color, i) => ({
        color, score: 0, direction: i === 0 ? "ArrowRight" : "ArrowLeft",
        snake: i === 0 ? [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
            : [{ x: size - 1, y: size - 1 }, { x: size - 2, y: size - 1 }, { x: size - 3, y: size - 1 }],
    }));
    return {
        size, fruitCount, players, fruits: generateFruit(size, fruitCount, players.map((p) => p.snake)),
        phase: colors.length === 2 ? "countdown" : "running", countdown: 30, winner: null, reason: "", round
    };
}

export function queueDirection(game, queues, player, direction) {
    if (game?.phase !== "running" || !DIRECTIONS[direction] || !game.players[player]) return;
    const queue = queues[player];
    const last = queue[queue.length - 1] ?? game.players[player].direction;
    if (queue.length < 4 && direction !== last && direction !== DIRECTIONS[last].opposite) queue.push(direction);
}

export function tickGame(game, queues) {
    if (game.phase === "countdown") {
        const countdown = game.countdown - 1;
        return { ...game, countdown, phase: countdown <= 0 ? "running" : "countdown" };
    }
    if (game.phase !== "running") return game;
    const fruitSet = new Set(game.fruits);
    const heads = [];
    const eats = [];
    const players = game.players.map((player, i) => {
        const direction = queues[i].shift() ?? player.direction;
        const delta = DIRECTIONS[direction];
        const oldHead = player.snake[player.snake.length - 1];
        const head = { x: oldHead.x + delta.x, y: oldHead.y + delta.y };
        heads.push(head);
        const eating = head.x >= 0 && head.x < game.size && head.y >= 0 && head.y < game.size
            && fruitSet.has(cellKey(head, game.size));
        eats.push(eating);
        const snake = [...player.snake, head];
        if (!eating) snake.shift();
        return { ...player, direction, snake, score: player.score + (eating ? 1 : 0) };
    });
    const dead = heads.map((head, i) => {
        if (head.x < 0 || head.x >= game.size || head.y < 0 || head.y >= game.size) return true;
        if (players[i].snake.slice(0, -1).some((cell) => sameCell(head, cell))) return true;
        return players.some((other, j) => j !== i && (
            other.snake.some((cell) => sameCell(head, cell)) ||
            (sameCell(head, game.players[j].snake.at(-1)) && sameCell(heads[j], game.players[i].snake.at(-1)))
        ));
    });
    if (dead.some(Boolean)) {
        const winner = players.length === 2 && dead[0] !== dead[1] ? (dead[0] ? 1 : 0) : null;
        return {
            ...game, phase: "over", winner,
            reason: players.length === 2 && dead.every(Boolean) ? "Both snakes collided. Draw!" : "A snake crashed."
        };
    }
    if (players.length === 1 && players[0].snake.length === game.size * game.size) {
        return { ...game, players, phase: "over", winner: 0, reason: "Field filled!" };
    }
    const eaten = new Set(heads.filter((_, i) => eats[i]).map((head) => cellKey(head, game.size)));
    const fruits = eaten.size ? generateFruit(game.size, game.fruitCount, players.map((p) => p.snake),
        game.fruits.filter((cell) => !eaten.has(cell))) : game.fruits;
    return { ...game, players, fruits };
}

const peerOptions = {
    config: {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turns:standard.relay.metered.ca:443?transport=tcp",
                username: "564a2f5dae156ca13997d765",
                credential: "5cSRQVxEpZDw/Ggf",
            }
        ]
    }
};

function readJoinCode(value) {
    let code = value.trim();
    if (/^https?:\/\//i.test(code)) {
        try { code = new URL(code).searchParams.get("join") || ""; } catch { return ""; }
    }
    return /^[a-z0-9]{5}$/i.test(code) ? code.toLowerCase() : "";
}

function App() {
    const invitation = new URLSearchParams(window.location.search).get("join") || "";
    const [fieldSize, setFieldSize] = useState(25);
    const [fruitCount, setFruitCount] = useState(1);
    const [color, setColor] = useState(COLORS[invitation ? 1 : 0].value);
    const [role, setRole] = useState("single");
    const [hostColor, setHostColor] = useState(null);
    const [game, setGame] = useState(null);
    const [connected, setConnected] = useState(false);
    const [status, setStatus] = useState("");
    const [link, setLink] = useState("");
    const playgroundRef = useRef();
    const settingsRef = useRef();
    const gameRef = useRef(null);
    const peerRef = useRef(null);
    const connectionRef = useRef(null);
    const timeoutRef = useRef(null);
    const directionQueue = useRef([[], []]);

    const updateGame = (next) => {
        gameRef.current = next;
        setGame(next);
    };
    const send = (message) => {
        if (connectionRef.current?.open) connectionRef.current.send(message);
    };
    const startGame = (opponentColor) => {
        directionQueue.current = [[], []];
        const colors = opponentColor ? [color, opponentColor] : [color];
        const next = createGame(fieldSize, fruitCount, colors, (gameRef.current?.round || 0) + 1);
        updateGame(next);
        send({ type: "game", game: next });
        playgroundRef.current.focus();
    };
    const localPlayer = role === "guest" ? 1 : 0;
    const hasGame = game !== null;
    const playing = hasGame && game.phase !== "over";

    useEffect(() => {
        if (hasGame) {
            settingsRef.current.close();
            playgroundRef.current.focus();
        } else if (!settingsRef.current.open) settingsRef.current.showModal();
    }, [hasGame]);

    useEffect(() => () => {
        clearTimeout(timeoutRef.current);
        const peer = peerRef.current;
        peerRef.current = null;
        peer?.destroy();
    }, []);

    useEffect(() => {
        if (!playing || role === "guest") return;
        const interval = setInterval(() => {
            const next = tickGame(gameRef.current, directionQueue.current);
            updateGame(next);
            send({ type: "game", game: next });
        }, 100);
        return () => clearInterval(interval);
    }, [playing, role]);

    const copyLink = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            setStatus("Link copied! Waiting for another player…");
        } catch { setStatus("Waiting for another player. Copy the link below to invite them."); }
    };

    const openMultiplayer = (isHost) => {
        const code = isHost ? "" : readJoinCode(invitation || window.prompt("Enter the join code or invitation URL:") || "");
        if (!isHost && !code) {
            setStatus("Enter a five-character join code or invitation URL.");
            return;
        }
        setRole(isHost ? "host" : "guest");
        setStatus("Connecting…");
        const peer = isHost
            ? new Peer(Math.random().toString(36).slice(2, 7).padEnd(5, "0"), peerOptions)
            : new Peer(peerOptions);
        peerRef.current = peer;
        const active = () => peerRef.current === peer;
        const disconnect = (message) => {
            if (!active()) return;
            clearTimeout(timeoutRef.current);
            setConnected(false);
            setStatus(message);
            if (gameRef.current && gameRef.current.phase !== "over") {
                updateGame({ ...gameRef.current, phase: "over", winner: isHost ? 0 : 1, reason: message });
            }
            peerRef.current = null;
            connectionRef.current = null;
            peer.destroy();
        };
        timeoutRef.current = setTimeout(() => disconnect("Connection timed out. Please try again."), 15000);

        const setupConnection = (connection) => {
            if (connectionRef.current) {
                connection.on("open", () => { connection.send({ type: "busy" }); connection.close(); });
                return;
            }
            connectionRef.current = connection;
            connection.on("open", () => {
                if (!active()) return;
                clearTimeout(timeoutRef.current);
                setConnected(true);
                setStatus("Connected! Waiting for game…");
                send(isHost ? { type: "color", color } : { type: "join", color });
            });
            connection.on("data", (message) => {
                if (!active() || !message) return;
                if (message.type === "busy") disconnect("This game already has two players.");
                if (isHost && message.type === "join" && !gameRef.current && COLORS.some((c) => c.value === message.color)) {
                    if (message.color === color) send({ type: "color", color, error: "Choose a different color from the host." });
                    else startGame(message.color);
                }
                if (isHost && message.type === "turn" && message.round === gameRef.current?.round) {
                    queueDirection(gameRef.current, directionQueue.current, 1, message.direction);
                }
                if (!isHost && message.type === "color") {
                    setHostColor(message.color);
                    setStatus(message.error || "Waiting for game…");
                }
                if (!isHost && message.type === "game" && message.game?.players?.length === 2) {
                    if (message.game.round !== gameRef.current?.round) playgroundRef.current.focus();
                    setFieldSize(message.game.size);
                    setFruitCount(message.game.fruitCount);
                    updateGame(message.game);
                }
            });
            connection.on("close", () => disconnect("Opponent left."));
            connection.on("error", () => disconnect("Connection lost."));
        };
        peer.on("open", (id) => {
            if (!active()) return;
            if (isHost) {
                clearTimeout(timeoutRef.current);
                const url = `${window.location.origin}${window.location.pathname}?join=${id}`;
                setLink(url);
                copyLink(url);
            } else setupConnection(peer.connect(code, { reliable: true }));
        });
        peer.on("connection", setupConnection);
        peer.on("error", (error) => disconnect(`Connection error: ${error.type}. Please try again.`));
    };

    const handleKeyDown = (event) => {
        if (gameRef.current?.phase !== "running" || !DIRECTIONS[event.key]) return;
        event.preventDefault();
        if (event.repeat) return;
        if (role === "guest") send({ type: "turn", direction: event.key, round: gameRef.current.round });
        else queueDirection(gameRef.current, directionQueue.current, 0, event.key);
    };
    const leaveGame = () => { window.location.href = window.location.pathname; };
    const result = game?.winner === null ? (role === "single" ? "Game Over!" : "Draw!")
        : game?.winner === localPlayer ? "You win!" : "You lose!";

    return <>
        <dialog id="settings-dialog" ref={settingsRef} aria-labelledby="settings-title"
            onCancel={(event) => event.preventDefault()}>
            <h2 id="settings-title">Game settings</h2>
            <div className="slider-container">
                <label htmlFor="field-size">Game screen size ({fieldSize}×{fieldSize}):</label>
                <input id="field-size" type="range" min="10" max="100" value={fieldSize} disabled={role !== "single"}
                    onChange={(event) => {
                        const size = Number(event.target.value);
                        setFieldSize(size);
                        setFruitCount((count) => Math.min(count, size * size));
                    }} />
            </div>
            <div className="slider-container">
                <label htmlFor="fruit-count">Amount of fruit ({fruitCount}):</label>
                <input id="fruit-count" type="range" min="1" max={fieldSize * fieldSize} value={fruitCount}
                    disabled={role !== "single"} onChange={(event) => setFruitCount(Number(event.target.value))} />
            </div>
            <label htmlFor="snake-color">Snake color</label>
            <select id="snake-color" value={color} disabled={role === "host" || (role === "guest" && !connected)} onChange={(event) => {
                setColor(event.target.value);
                if (role === "guest") send({ type: "join", color: event.target.value });
            }}>
                {COLORS.map((option) => <option key={option.value} value={option.value} disabled={option.value === hostColor}>{option.name}</option>)}
            </select>
            {role === "single" && <>
                <div className="settings-buttons">
                    <button type="button" onClick={() => startGame()}>Play singleplayer</button>
                    <button type="button" onClick={() => openMultiplayer(true)}>Create multiplayer game</button>
                    <button type="button" onClick={() => openMultiplayer(false)}>Join multiplayer game</button>
                </div>
            </>}
            {status && <p role="status">{status}</p>}
            {link && <>
                <p>Join code: <strong>{new URL(link).searchParams.get("join")}</strong></p>
                <input aria-label="Invitation URL" value={link} readOnly onFocus={(event) => event.target.select()} />
                <div className="settings-buttons"><button type="button" onClick={() => copyLink(link)}>Copy link</button></div>
            </>}
            {role !== "single" && <div className="settings-buttons"><button type="button" onClick={leaveGame}>Leave game</button></div>}
        </dialog>
        <div className="App" ref={playgroundRef} tabIndex={0} onKeyDown={handleKeyDown}
            aria-label="Snake game field" style={{ width: `${fieldSize * 20}px` }}>
            {game && <div className="count">
                score: {game.players[localPlayer].score}
                {game.players.length === 2 && ` · opponent: ${game.players[1 - localPlayer].score}`}
            </div>}
            {game?.phase === "countdown" && <div className="game-over text">{Math.ceil(game.countdown / 10)}</div>}
            {game?.phase === "over" && <>
                <div className="game-over text">{result}</div>
                {(role === "single" || (role === "host" && connected)) && <button type="button"
                    onClick={() => startGame(game.players[1]?.color)}>{role === "single" ? "Restart" : "Rematch"}</button>}
                {role === "guest" && connected && <div className="text">Waiting for host…</div>}
                <button className="change-settings" type="button" onClick={leaveGame}>Game settings</button>
            </>}
            {game?.players.map((player, i) => <Snake key={i} snake={player.snake} fieldSize={game.size} color={player.color} />)}
            {game?.phase !== "over" && game?.fruits.map((cell) => <Food key={cell} position={{ x: cell % game.size, y: Math.floor(cell / game.size) }} fieldSize={game.size} />)}
        </div>
        <div className="arrow-msg text">Press arrow keys to play!</div>
        {role !== "single" && playing && <button className="leave-game" type="button" onClick={leaveGame}>Leave game</button>}
    </>;
}

export default App;
