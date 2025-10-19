// Firebase v9+ modular imports (you already had these)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, get, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyB5PTXWWS8Z9Q63SFGkfw_0R1N36SeplHo",
  authDomain: "tic-tac-toe-fbc22.firebaseapp.com",
  databaseURL: "https://tic-tac-toe-fbc22-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tic-tac-toe-fbc22",
  storageBucket: "tic-tac-toe-fbc22.firebasestorage.app",
  messagingSenderId: "119223402145",
  appId: "1:119223402145:web:bab29e94933d4c011a7ae0",
  measurementId: "G-83EEGG26ZP"
};

// Initialize Firebase (modular)
let app, db;
try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  console.log("✅ Firebase (modular) initialized");
} catch (err) {
  console.error("❌ Firebase init error:", err);
}

// ---------------- Game state ----------------
let mode = null;
let board = Array(9).fill(null);
let isXNext = true;
let winner = null;
let winningLine = [];
let isComputerThinking = false;

// Online variables
let currentRoomId = null;
let playerSymbol = null;
let roomRef = null; // will hold a modular ref(...) object
let isMyTurn = false;
let gameStarted = false;
let unsubscribeRoom = null; // store onValue unsubscribe if needed

const winPatterns = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function generateRoomId() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

// ---------------- Mode selection ----------------
function selectMode(selectedMode) {
  console.log("Mode selected:", selectedMode);
  mode = selectedMode;

  if (mode === 'online') {
    if (!db) {
      alert('Firebase not configured');
      return;
    }
    document.getElementById('modeSelection').classList.add('hidden');
    document.getElementById('onlineScreen').classList.remove('hidden');
  } else {
    document.getElementById('modeSelection').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');

    const modeTitle = document.getElementById('modeTitle');
    const playerInfo = document.getElementById('playerInfo');

    if (mode === 'single') {
      modeTitle.textContent = 'vs Computer';
      playerInfo.style.display = 'block';
      playerInfo.innerHTML = 'You are <span class="player-x">X</span> • Computer is <span class="player-o">O</span>';
    } else {
      modeTitle.textContent = 'Two Players (Local)';
      playerInfo.style.display = 'none';
    }

    resetGame();
  }
}

// ---------------- Online: create room ----------------
async function createRoom() {
  console.log("Creating room...");
  currentRoomId = generateRoomId();
  playerSymbol = 'X';
  isMyTurn = true;
  gameStarted = false;

  roomRef = ref(db, 'rooms/' + currentRoomId);

  await set(roomRef, {
    board: Array(9).fill(null),
    players: 1,
    currentTurn: 'X',
    winner: null,
    winningLine: [],
    gameStarted: false,
    lastUpdate: Date.now()
  });

  document.getElementById('displayRoomId').textContent = currentRoomId;
  document.getElementById('roomInfo').classList.remove('hidden');
  document.getElementById('waitingMessage').style.display = 'block';
  document.getElementById('playerRole').textContent = 'You are: X';

  // attach listener
  if (unsubscribeRoom) { unsubscribeRoom(); unsubscribeRoom = null; }
  unsubscribeRoom = onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    console.log("📡 [Creator] Firebase update:", data);

    // If DB says gameStarted true, start game UI if not started
    if (data.gameStarted && !gameStarted) {
      gameStarted = true;
      document.getElementById('waitingMessage').style.display = 'none';
      startOnlineGame(false); // false = don't reset DB (we already have DB)
    }

    // If players become 2 and game wasn't started, set gameStarted remotely (let DB be source of truth)
    if (data.players === 2 && !data.gameStarted) {
      // set DB gameStarted true (this will trigger the onValue again)
      update(roomRef, { gameStarted: true, lastUpdate: Date.now() }).catch(e => console.error(e));
    }

    // Always update local state from DB so both players stay in sync
    if (data.gameStarted) updateOnlineGame(data);
  }, (err) => {
    console.error("Firebase listener error (creator):", err);
  });
}

// ---------------- Online: join room ----------------
async function joinRoom() {
  const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
  console.log("Joining room:", roomId);

  if (!roomId) {
    alert('Please enter a Room ID');
    return;
  }

  currentRoomId = roomId;
  roomRef = ref(db, 'rooms/' + currentRoomId);

  try {
    const snapshot = await get(roomRef);
    const data = snapshot.val();

    if (!data) {
      alert('Room not found!');
      return;
    }
    if (data.players >= 2) {
      alert('Room is full!');
      return;
    }

    playerSymbol = 'O';
    isMyTurn = false;
    gameStarted = true;

    // update player count and flag; DB will be authoritative
    await update(roomRef, { players: 2, playerO: true, gameStarted: true, lastUpdate: Date.now() });

    document.getElementById('displayRoomId').textContent = currentRoomId;
    document.getElementById('roomInfo').classList.remove('hidden');
    document.getElementById('waitingMessage').style.display = 'none';
    document.getElementById('playerRole').textContent = 'You are: O';

    // start local UI
    startOnlineGame(false);

    // attach listener
    if (unsubscribeRoom) { unsubscribeRoom(); unsubscribeRoom = null; }
    unsubscribeRoom = onValue(roomRef, (snap) => {
      const d = snap.val();
      if (!d) return;
      console.log("📡 [Joiner] Firebase update:", d);
      if (d.gameStarted) {
        // DB driven update
        gameStarted = true;
        updateOnlineGame(d);
      }
    }, (err) => {
      console.error("Firebase listener error (joiner):", err);
    });

  } catch (err) {
    console.error("Error joining room:", err);
    alert('Error joining room');
  }
}

// ---------------- Start online UI ----------------
// param resetLocal - if true we reset local board state; if false we assume DB already has initial state
function startOnlineGame(resetLocal = true) {
  console.log("🎮 Starting game as:", playerSymbol);
  document.getElementById('onlineScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');

  document.getElementById('modeTitle').textContent = 'Online - Room: ' + currentRoomId;
  document.getElementById('playerInfo').textContent = `You are: ${playerSymbol}`;
  document.getElementById('playerInfo').style.display = 'block';

  if (resetLocal) {
    board = Array(9).fill(null);
    winner = null;
    winningLine = [];
    isXNext = true;
    isMyTurn = (playerSymbol === 'X');
  } else {
    // if DB has board, we will fetch via updateOnlineGame when onValue triggers
    isMyTurn = (playerSymbol === 'X'); // safe default until we receive DB currentTurn
  }

  updateBoard();
  updateStatus();
}

function updateOnlineGame(data) {
  if (!data || !data.gameStarted) return;

  // Build fresh array copying DB values (handle sparse arrays safely)
  const newBoard = Array(9).fill(null);
  if (data.board && Array.isArray(data.board)) {
    for (let i = 0; i < 9; i++) {
      newBoard[i] = (typeof data.board[i] === 'string' ? data.board[i] : null);
    }
  }

  board = newBoard;
  winner = data.winner || null;
  winningLine = Array.isArray(data.winningLine) ? data.winningLine : [];
  isXNext = data.currentTurn === 'X';

  // Determine turn based on DB's authoritative currentTurn and winner
  isMyTurn = (data.currentTurn === playerSymbol) && !winner;
  gameStarted = true;

  console.log("📥 updateOnlineGame -> isMyTurn:", isMyTurn, "currentTurn:", data.currentTurn, "winner:", winner);
  updateBoard();
  updateStatus();
}

// ---------------- copy / menu ----------------
async function copyRoomId() {
  const roomId = document.getElementById('displayRoomId').textContent;
  try {
    await navigator.clipboard.writeText(roomId);
    alert('Room ID copied!');
  } catch {
    // fallback
    const t = document.createElement('textarea');
    t.value = roomId;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
    alert('Room ID copied!');
  }
}

async function goToMenu() {
  // remove listeners
  if (unsubscribeRoom) {
    try { unsubscribeRoom(); } catch(e) { /* ignore */ }
    unsubscribeRoom = null;
  }

  // if I created the room (X) and we want to delete it on leaving, remove it
  if (roomRef && mode === 'online' && playerSymbol === 'X' && currentRoomId) {
    try {
      await remove(ref(db, 'rooms/' + currentRoomId));
    } catch(e) { console.warn("Could not remove room:", e); }
  }

  mode = null;
  currentRoomId = null;
  playerSymbol = null;
  roomRef = null;
  isMyTurn = false;
  gameStarted = false;

  document.getElementById('gameScreen').classList.add('hidden');
  document.getElementById('onlineScreen').classList.add('hidden');
  document.getElementById('modeSelection').classList.remove('hidden');
  document.getElementById('roomInfo').classList.add('hidden');
  document.getElementById('roomIdInput').value = '';

  resetGame();
}

// ---------------- Game logic helpers ----------------
function checkWinner(currentBoard) {
  for (let pattern of winPatterns) {
    const [a,b,c] = pattern;
    if (currentBoard[a] && currentBoard[a] === currentBoard[b] && currentBoard[a] === currentBoard[c]) {
      return { winner: currentBoard[a], line: pattern };
    }
  }
  if (currentBoard.every(cell => cell !== null)) return { winner: 'draw', line: [] };
  return null;
}

function makeComputerMove(currentBoard) {
  const emptyCells = currentBoard.map((cell, idx) => cell === null ? idx : null).filter(x => x !== null);
  if (emptyCells.length === 0) return undefined;

  for (let pattern of winPatterns) {
    const [a,b,c] = pattern;
    const vals = [currentBoard[a], currentBoard[b], currentBoard[c]];
    if (vals.filter(v => v === 'O').length === 2 && vals.includes(null)) return pattern.find(i => currentBoard[i] === null);
  }
  for (let pattern of winPatterns) {
    const [a,b,c] = pattern;
    const vals = [currentBoard[a], currentBoard[b], currentBoard[c]];
    if (vals.filter(v => v === 'X').length === 2 && vals.includes(null)) return pattern.find(i => currentBoard[i] === null);
  }
  if (currentBoard[4] === null) return 4;
  return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

// ---------------- UI updates ----------------
function updateBoard() {
  const cells = document.querySelectorAll('.cell');
  cells.forEach((cell, idx) => {
    cell.textContent = board[idx] || '';
    cell.className = 'cell';
    if (board[idx]) cell.classList.add(board[idx].toLowerCase());
    if (winningLine.includes(idx)) cell.classList.add('winning');

    // disable rules:
    // - if the cell is already filled OR
    // - if online AND it's not my turn OR winner exists
    if (board[idx]) {
      cell.disabled = true;
    } else if (mode === 'online') {
      cell.disabled = !isMyTurn || winner !== null;
    } else {
      cell.disabled = winner !== null || isComputerThinking;
    }
  });

  const turnPlayer = document.getElementById('turnPlayer');
  if (turnPlayer) turnPlayer.textContent = isXNext ? 'X' : 'O';
}

function updateStatus() {
  const currentTurn = document.getElementById('currentTurn');
  if (winner) {
    currentTurn.className = 'status-box winner';
    if (winner === 'draw') currentTurn.innerHTML = "It's a Draw!";
    else currentTurn.innerHTML = (mode === 'online') ? (winner === playerSymbol ? '🎉 You Win! 🎉' : '😔 You Lose!') : `${winner} Wins!`;
  } else {
    currentTurn.className = 'status-box';
    if (mode === 'online') currentTurn.innerHTML = isMyTurn ? '✨ Your Turn ✨' : "⏳ Opponent's Turn";
    else currentTurn.innerHTML = `Current Turn: <span id="turnPlayer" class="turn-player">${isXNext ? 'X' : 'O'}</span>`;
  }
}

// ---------------- Click handler ----------------
async function handleClick(idx) {
  console.log("CLICK", idx, "board:", board, "isMyTurn:", isMyTurn, "symbol:", playerSymbol, "gameStarted:", gameStarted);

  if (board[idx] !== null) {
    console.log("Cell occupied", board[idx]);
    return;
  }
  if (winner) {
    console.log("Game over");
    return;
  }

  if (mode === 'online') {
    if (!gameStarted) {
      alert("Waiting for opponent...");
      return;
    }
    if (!isMyTurn) {
      alert("Wait for your turn!");
      return;
    }

    // create copy, set move locally for instant feedback
    const newBoard = board.slice();
    newBoard[idx] = playerSymbol;
    board = newBoard;
    updateBoard();
    updateStatus();

    // compute result
    const result = checkWinner(newBoard);
    const newWinner = result ? result.winner : null;
    const newWinningLine = result ? result.line : [];

    const nextTurn = (playerSymbol === 'X') ? 'O' : 'X';

    // push authoritative update to DB
    const updates = {
      board: newBoard,
      currentTurn: nextTurn,
      winner: newWinner,
      winningLine: newWinningLine,
      lastUpdate: Date.now()
    };

    try {
      await update(roomRef, updates);
      console.log("Firebase updated");
      // We rely on DB -> onValue to update isMyTurn for both sides.
      isMyTurn = false;
    } catch (err) {
      console.error("Firebase update error:", err);
      // revert
      board[idx] = null;
      updateBoard();
      updateStatus();
      alert("Connection error. Try again.");
    }

  } else if (mode === 'single') {
    // keep your single-player code (unchanged)
    board[idx] = 'X';
    updateBoard();
    const result = checkWinner(board);
    if (result) {
      winner = result.winner;
      winningLine = result.line;
      updateBoard();
      updateStatus();
      return;
    }
    isXNext = false;
    isComputerThinking = true;
    updateBoard(); updateStatus();
    setTimeout(() => {
      const cm = makeComputerMove(board);
      if (cm !== undefined) {
        board[cm] = 'O';
        const cres = checkWinner(board);
        if (cres) { winner = cres.winner; winningLine = cres.line; }
      }
      isXNext = true; isComputerThinking = false;
      updateBoard(); updateStatus();
    }, 500);
  } else if (mode === 'two') {
    board[idx] = isXNext ? 'X' : 'O';
    const res = checkWinner(board);
    if (res) { winner = res.winner; winningLine = res.line; updateBoard(); updateStatus(); return; }
    isXNext = !isXNext; updateBoard(); updateStatus();
  }
}

// ---------------- Reset ----------------
async function resetGame() {
  board = Array(9).fill(null);
  isXNext = true;
  winner = null;
  winningLine = [];
  isComputerThinking = false;

  if (mode === 'online' && roomRef && gameStarted) {
    isMyTurn = (playerSymbol === 'X');
    try {
      await update(roomRef, { board: Array(9).fill(null), currentTurn: 'X', winner: null, winningLine: [], lastUpdate: Date.now() });
    } catch(e) { console.warn("Reset firebase failed:", e); }
  }

  updateBoard();
  updateStatus();
}

// ---------------- DOM wiring ----------------
document.addEventListener('DOMContentLoaded', () => {
  console.log("Page loaded");
  // Button IDs must match HTML - keep your existing IDs
  document.getElementById('singlePlayerBtn').onclick = () => selectMode('single');
  document.getElementById('twoPlayerBtn').onclick = () => selectMode('two');
  document.getElementById('onlinePlayerBtn').onclick = () => selectMode('online');

  document.getElementById('createRoomBtn').onclick = createRoom;
  document.getElementById('joinRoomBtn').onclick = joinRoom;
  document.getElementById('copyRoomIdBtn').onclick = copyRoomId;
  document.getElementById('backToMenuBtn').onclick = goToMenu;
  document.getElementById('homeBtn').onclick = goToMenu;
  document.getElementById('resetBtn').onclick = resetGame;

  // cells must have data-index attributes 0..8
  document.querySelectorAll('.cell').forEach(cell => {
    cell.onclick = (e) => {
      const index = parseInt(e.currentTarget.getAttribute('data-index'));
      handleClick(index);
    };
  });

  updateBoard();
  updateStatus();
});
