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
      statusEl.textContent = 'Connected! Race to solve it.';
    }
    if (msg.type === 'guess') {
      const row = document.createElement('div');
      msg.colors.forEach(col => {
        const b = document.createElement('span');
        b.style.cssText = `display:inline-block;width:14px;height:14px;margin:1px;background:${col}`;
        row.appendChild(b);
      });
      oppBoard.appendChild(row);
      if (msg.solved) toastr.warning('Your opponent solved it first!');
    }
  });
  conn.on('close', () => statusEl.textContent = 'Opponent left.');
}

window.mpReport = (colors, solved) => {
  if (conn && conn.open) conn.send({ type: 'guess', colors, solved });
};

// HOST
document.getElementById('mp-create').onclick = () => {
  peer = new Peer();
  peer.on('open', (id) => {
    const link = `${location.origin}${location.pathname}?join=${id}`;
    statusEl.textContent = 'Share this link: ' + link;
    navigator.clipboard?.writeText(link);
  });
  peer.on('connection', (c) => {
    setupConn(c);
    c.on('open', () => {
      // wait until the word list is loaded, then pick the word
      initBoard();
      setTimeout(() => {
        c.send({ type: 'start', word: rightGuessString,
                 guesses: NUMBER_OF_GUESSES, length: WORD_LENGTH });
        statusEl.textContent = 'Opponent connected!';
      }, 1500);
    });
  });
};

// GUEST
const joinId = new URLSearchParams(location.search).get('join');
if (joinId) {
  peer = new Peer();
  peer.on('open', () => {
    setupConn(peer.connect(joinId));
    statusEl.textContent = 'Joining...';
  });
}