let WORDS = [];

var guessSlider = document.getElementById('number-of-guesses');
var wordLengthSlider = document.getElementById('word-length');
var guessValue = document.getElementById('number-of-guesses-value');
var wordLengthValue = document.getElementById('word-length-value');
let NUMBER_OF_GUESSES = parseInt(guessSlider.value);
let WORD_LENGTH = parseInt(wordLengthSlider.value);

guessValue.textContent = guessSlider.value;
wordLengthValue.textContent = wordLengthSlider.value;

let WORDS_URL = `https://raw.githubusercontent.com/mstgnz/words/main/lang/en/length/${WORD_LENGTH}_letter_words.txt`;
let guessesRemaining = NUMBER_OF_GUESSES;
let currentGuess = [];
let nextLetter = 0;
let rightGuessString = WORDS[Math.floor(Math.random() * WORDS.length)];

// Page initialization
function initPage() {
    initBoard();
}

document.addEventListener('DOMContentLoaded', initPage);

// This should fix CBU's blocking
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

// This allows the user to change how many guesses they get
guessSlider.addEventListener('input', (e) => {
    NUMBER_OF_GUESSES = parseInt(e.target.value);
    guessValue.textContent = e.target.value;
});

wordLengthSlider.addEventListener('input', (e) => {
    WORD_LENGTH = parseInt(e.target.value);
    wordLengthValue.textContent = e.target.value;
    WORDS_URL = `https://raw.githubusercontent.com/mstgnz/words/main/lang/en/length/${WORD_LENGTH}_letter_words.txt`;
});

async function loadWords() {
    const response = await fetch(WORDS_URL);
    if (!response.ok) throw new Error(`Failed to load words: ${response.status}`);
    const text = await response.text();
    WORDS = text
        .split(/\r?\n/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length === WORD_LENGTH);
}

async function initBoard(forcedWord = null) {
    await loadWords();
    guessesRemaining = NUMBER_OF_GUESSES;
    document.getElementById('game-board').innerHTML = '';
    currentGuess = [];
    nextLetter = 0;
    rightGuessString = forcedWord || WORDS[Math.floor(Math.random() * WORDS.length)];
    resetKeyboard();

    let board = document.getElementById('game-board');

    for (let i = 0; i < NUMBER_OF_GUESSES; i++) {
        let row = document.createElement('div');
        row.className = 'letter-row';

        for (let j = 0; j < WORD_LENGTH; j++) {
            let box = document.createElement('div');
            box.className = 'letter-box';
            row.appendChild(box);
        }

        board.appendChild(row);
    }
}

function handleKey(pressedKey) {
    if (settingsDialog.open) return;
    if (guessesRemaining === 0) {
        return;
    }

    if (pressedKey === "Backspace" && nextLetter !== 0) {
        deleteLetter()
        return
    }

    if (pressedKey === "Enter") {
        checkGuess()
        return
    }

    let found = pressedKey.match(/[a-z]/gi)
    if (!found || found.length > 1) {
        return
    } else {
        insertLetter(pressedKey)
    }
}

document.addEventListener("keydown", (e) => {
    if (settingsDialog.open) return;
    if (e.key === "Backspace" || e.key === "Enter" || /^[a-z]$/i.test(e.key)) {
        e.preventDefault();
    }
    handleKey(String(e.key));
});

function insertLetter(pressedKey) {
    if (nextLetter === WORD_LENGTH) {
        return;
    }
    pressedKey = pressedKey.toLowerCase();

    let row = document.getElementsByClassName('letter-row')[NUMBER_OF_GUESSES - guessesRemaining];
    let box = row.children[nextLetter];
    animateCSS(box, 'pulse');
    box.textContent = pressedKey;
    box.classList.add('filled-box');
    currentGuess.push(pressedKey);
    nextLetter += 1;
}

function deleteLetter() {
    let row = document.getElementsByClassName('letter-row')[NUMBER_OF_GUESSES - guessesRemaining];
    let box = row.children[nextLetter - 1];
    box.textContent = '';
    box.classList.remove('filled-box');
    currentGuess.pop();
    nextLetter -= 1;
}

function resetKeyboard() {
    for (const key of document.getElementsByClassName('key')) {
        key.style.backgroundColor = '';
    }
}

function hideGameSettings() {
    settingsDialog.close();
    document.getElementById("mp-rematch").style.display = "none";
}

function checkGuess() {
    let row = document.getElementsByClassName('letter-row')[NUMBER_OF_GUESSES - guessesRemaining];
    let guessString = ''
    let rightGuess = Array.from(rightGuessString);

    for (const val of currentGuess) {
        guessString += val;
    }

    if (guessString.length != WORD_LENGTH) {
        toastr.error("Not enough letters!")
        return;
    }

    if (!WORDS.includes(guessString)) {
        toastr.error("Word not in list!");
        return;
    }

    const colors = Array(WORD_LENGTH).fill('');
    for (let i = 0; i < WORD_LENGTH; i++) {
        let letterColor = '';
        let box = row.children[i];
        let letter = currentGuess[i];

        let letterPosition = rightGuess.indexOf(currentGuess[i]);
        // is letter in the correct guess
        if (letterPosition === -1) {
            letterColor = 'grey';
        } else {
            // now, letter is definitely in the word
            // if letter index and right guess index are the same
            // letter is in the right position
            if (currentGuess[i] === rightGuess[i]) {
                // shade green
                letterColor = 'green';
            } else {
                // shade box yellow
                letterColor = 'yellow';
            }

            rightGuess[letterPosition] = "#"
        }

        colors[i] = letterColor;
        let delay = 250 * i
        setTimeout(() => {
            // flip box
            animateCSS(box, 'flipInX');
            // shade box
            box.style.backgroundColor = letterColor;
            shadeKeyBoard(letter, letterColor);
        }, delay);
    }
    if (window.mpReport) {
        window.mpReport(colors, guessString === rightGuessString);
    }

    if (guessString === rightGuessString) {
        toastr.success("You guessed right! Game over!");
        guessesRemaining = 0;
        if (!conn) {
            newGameButton.style.display = "block";
        }
        return;
    }

    guessesRemaining -= 1;
    currentGuess = [];
    nextLetter = 0;

    if (guessesRemaining === 0) {
        toastr.error("You've run out of guesses! Game over!");
        toastr.info(`The right word was: "${rightGuessString}"`);
        if (!conn) {
            newGameButton.style.display = "block";
        }
        if (conn && conn.open) {
            conn.send({ type: 'failure' });
        }
    }
}

function shadeKeyBoard(letter, color) {
    for (const elem of document.getElementsByClassName('key')) {
        if (elem.textContent === letter) {
            let oldColor = elem.style.backgroundColor;
            if (oldColor === 'green') {
                return
            }

            if (oldColor === 'yellow' && color !== 'green') {
                return
            }
            elem.style.backgroundColor = color;
            break;
        }
    }
}

document.getElementById("keyboard-cont").addEventListener("click", (e) => {
    const target = e.target;

    if (!target.classList.contains('key')) {
        return;
    }
    let key = target.textContent

    if (key === "Del") {
        key = "Backspace"
    }

    handleKey(key);
});

const animateCSS = (element, animation, prefix = 'animate__') =>
    // We create a Promise and return it
    new Promise((resolve, reject) => {
        const animationName = `${prefix}${animation}`;
        // const node = document.querySelector(element);
        const node = element
        node.style.setProperty('--animate-duration', '0.3s')

        node.classList.add(`${prefix}animated`, animationName);

        // When the animation ends, we clean the classes and resolve the Promise
        function handleAnimationEnd(event) {
            event.stopPropagation();
            node.classList.remove(`${prefix}animated`, animationName);
            resolve('Animation ended');
        }

        node.addEventListener('animationend', handleAnimationEnd, { once: true });
    });

/*
Multiplayer w peerJS
*/

let peer, conn;
const statusEl = document.getElementById('mp-status');
const oppBoard = document.getElementById('opp-board');

function setupConn(c) {
    conn = c;
    conn.on('data', (msg) => {
        if (msg.type === 'start') {
            guessSlider.value = msg.guesses;
            wordLengthSlider.value = msg.length;
            NUMBER_OF_GUESSES = msg.guesses;
            WORD_LENGTH = msg.length;
            WORDS_URL = `https://raw.githubusercontent.com/mstgnz/words/main/lang/en/length/${WORD_LENGTH}_letter_words.txt`;
            oppBoard.innerHTML = '';
            initBoard(msg.word);
            hideGameSettings();
            document.getElementById('mp-leave').style.display = 'block';
            statusEl.textContent = 'Opponent connected!';
        }
        if (msg.type === 'guess') {
            const row = document.createElement('div');
            msg.colors.forEach(col => {
                const b = document.createElement('span');
                b.style.cssText = `display:inline-block;width:14px;height:14px;margin:1px;background:${col}`;
                row.appendChild(b);
            });
            oppBoard.appendChild(row);
            if (msg.solved) {
                toastr.warning('Your opponent solved it first!');
                document.getElementById('mp-rematch').style.display = 'block';
            }
        }
        if (msg.type === 'failure') {
            toastr.warning('Your opponent ran out of guesses!');
            document.getElementById('mp-rematch').style.display = 'block';
        }
    });
    conn.on('close', () => statusEl.textContent = 'Opponent left.');
}

window.mpReport = (colors, solved) => {
    if (conn && conn.open) {
        conn.send({ type: 'guess', colors, solved });
    }
};

// HOST
document.getElementById('mp-create').onclick = async () => {
    await initBoard();
    settingsDialog.close();
    const lobbyId = Math.random().toString(36).slice(2, 7);
    peer = new Peer(lobbyId, peerOptions);
    peer.on('error', (e) => {
        console.error('HOST PEER ERROR', e.type, e);
        statusEl.textContent = `Unable to create lobby: ${e.type}`;
    });
    peer.on('open', (id) => {
        const link = `${location.origin}${location.pathname}?join=${id}`;
        statusEl.textContent = 'Share this link: ' + link + '\nLink copied to clipboard!';
        navigator.clipboard?.writeText(link);
    });
    peer.on('connection', (c) => {
        console.log('host: got connection');
        setupConn(c);
        c.on('open', () => {
            // wait until the word list is loaded, then pick the word
            initBoard().then(() => {
                c.send({
                    type: 'start', word: rightGuessString,
                    guesses: NUMBER_OF_GUESSES, length: WORD_LENGTH
                });
                statusEl.textContent = 'Opponent connected!';
                hideGameSettings();
            });
        });
    });
};

// GUEST
const joinId = new URLSearchParams(location.search).get('join');

console.log('Join code from URL:', joinId);
if (joinId) {
    statusEl.textContent = 'Contacting PeerJS...';

    peer = new Peer(peerOptions);

    peer.on('error', (e) => {
        console.error('GUEST PEER ERROR', e);
        statusEl.textContent = `Join error: ${e.type}`;
    });

    peer.on('open', (id) => {
        console.log('Guest registered:', id);
        statusEl.textContent = `Connecting to ${joinId.trim()}...`;

        const connection = peer.connect(joinId.trim(), { reliable: true });
        setupConn(connection);

        const timeout = setTimeout(() => {
            if (!connection.open) {
                statusEl.textContent = 'Connection timed out. Check both consoles.';
            }
        }, 15000);

        connection.on('open', () => {
            clearTimeout(timeout);
            console.log('Guest connection open');
            statusEl.textContent = 'Connected; waiting for game...';
        });

        connection.on('error', (e) => {
            clearTimeout(timeout);
            console.error('CONNECTION ERROR', e);
            statusEl.textContent = `Connection error: ${e.message}`;
        });
    });
}

document.getElementById('mp-rematch').onclick = async () => {
    await startRematch();
};

async function startRematch() {
    oppBoard.innerHTML = '';
    document.getElementById('mp-rematch').style.display = 'none';

    if (conn && conn.open) {
        await initBoard();
        conn.send({
            type: 'start',
            word: rightGuessString,
            guesses: NUMBER_OF_GUESSES,
            length: WORD_LENGTH
        });
        hideGameSettings();
    }
}

document.getElementById('mp-join').onclick = () => {
    const joinId = prompt('Enter the ID of the game to join:');
    if (joinId) {
        location.search = '?join=' + joinId;
    }
};

document.getElementById('mp-leave').onclick = () => {
    if (conn && conn.open) {
        conn.close();
    }
    location.href = location.pathname;
};

const settingsDialog = document.getElementById("settings-dialog");
const singleplayerButton = document.getElementById("start-singleplayer");
const newGameButton = document.getElementById("mp-restart");

newGameButton.addEventListener("click", () => {
    location.href = location.pathname;
});

// Show settings on an ordinary visit.
// A multiplayer invitation already gets its settings from the host.
if (!joinId) {
    settingsDialog.showModal();
}

// Require the player to choose a mode instead of dismissing with Escape.
settingsDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
});

singleplayerButton.addEventListener("click", async () => {
    singleplayerButton.disabled = true;

    try {
        await initBoard();
        settingsDialog.close();
    } catch (error) {
        console.error(error);
        toastr.error("Could not load the word list. Please try again.");
    } finally {
        singleplayerButton.disabled = false;
    }
});

initPage();