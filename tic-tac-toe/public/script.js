// Firebase v9+ modular imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

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

// Initialize Firebase
let db = null;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
    console.log("✅ Firebase initialized");
} catch (error) {
    console.error("❌ Firebase error:", error);
}

let mode = null;
let board = Array(9).fill(null);
let isXNext = true;
let winner = null;
let winningLine = [];
let isComputerThinking = false;

// Online mode variables
let currentRoomId = null;
let playerSymbol = null;
let roomRef = null;
let isMyTurn = false;
let gameStarted = false;
let processingMove = false; // NEW: Prevent double-clicks

const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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

function createRoom() {
    console.log("Creating room...");
    currentRoomId = generateRoomId();
    playerSymbol = 'X';
    isMyTurn = true;
    gameStarted = false;
    processingMove = false;
    
    roomRef = db.ref('rooms/' + currentRoomId);
    
    roomRef.set({
        board: Array(9).fill(null),
        players: 1,
        currentTurn: 'X',
        winner: null,
        winningLine: [],
        gameStarted: false
    });
    
    document.getElementById('displayRoomId').textContent = currentRoomId;
    document.getElementById('roomInfo').classList.remove('hidden');
    document.getElementById('waitingMessage').style.display = 'block';
    document.getElementById('playerRole').textContent = 'You are: X';
    
    roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        console.log("📡 [Creator] Firebase update:", data);
        
        if (data.players === 2 && !gameStarted) {
            gameStarted = true;
            roomRef.update({ gameStarted: true });
            document.getElementById('waitingMessage').style.display = 'none';
            startOnlineGame();
        } else if (gameStarted) {
            updateOnlineGame(data);
        }
    });
}

function joinRoom() {
    const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
    console.log("Joining room:", roomId);
    
    if (!roomId) {
        alert('Please enter a Room ID');
        return;
    }
    
    currentRoomId = roomId;
    roomRef = db.ref('rooms/' + currentRoomId);
    
    roomRef.once('value').then((snapshot) => {
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
        processingMove = false;
        
        roomRef.update({
            players: 2,
            gameStarted: true
        });
        
        document.getElementById('displayRoomId').textContent = currentRoomId;
        document.getElementById('roomInfo').classList.remove('hidden');
        document.getElementById('waitingMessage').style.display = 'none';
        document.getElementById('playerRole').textContent = 'You are: O';
        
        startOnlineGame();
        
        roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                console.log("📡 [Joiner] Firebase update:", data);
                updateOnlineGame(data);
            }
        });
    });
}

function startOnlineGame() {
    console.log("🎮 Starting game as:", playerSymbol);
    document.getElementById('onlineScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    
    const modeTitle = document.getElementById('modeTitle');
    const playerInfo = document.getElementById('playerInfo');
    
    modeTitle.textContent = 'Online - Room: ' + currentRoomId;
    playerInfo.innerHTML = `You are: <span class="player-${playerSymbol.toLowerCase()}">${playerSymbol}</span>`;
    playerInfo.style.display = 'block';
    
    board = Array(9).fill(null);
    winner = null;
    winningLine = [];
    isXNext = true;
    isMyTurn = (playerSymbol === 'X');
    processingMove = false;
    
    updateBoard();
    updateStatus();
}

function updateOnlineGame(data) {
    if (!data || !gameStarted) return;
    
    console.log("\n📥 Updating from Firebase");
    console.log("Firebase board:", data.board);
    console.log("Firebase turn:", data.currentTurn);
    console.log("I am:", playerSymbol);
    
    // Convert Firebase board to proper array
    const newBoard = Array(9).fill(null);
    if (data.board) {
        for (let i = 0; i < 9; i++) {
            newBoard[i] = data.board[i] || null;
        }
    }
    
    console.log("Old board:", board);
    console.log("New board:", newBoard);
    
    // Update local state
    board = newBoard;
    winner = data.winner || null;
    winningLine = data.winningLine || [];
    isXNext = data.currentTurn === 'X';
    isMyTurn = (data.currentTurn === playerSymbol) && !winner;
    processingMove = false; // CRITICAL: Re-enable clicking after Firebase update
    
    console.log("✅ My turn now?", isMyTurn);
    console.log("Processing move?", processingMove);
    
    updateBoard();
    updateStatus();
}

function copyRoomId() {
    const roomId = document.getElementById('displayRoomId').textContent;
    navigator.clipboard.writeText(roomId).then(() => {
        alert('Room ID copied!');
    }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = roomId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Room ID copied!');
    });
}

function goToMenu() {
    if (roomRef) {
        roomRef.off();
        if (currentRoomId && mode === 'online' && playerSymbol === 'X') {
            db.ref('rooms/' + currentRoomId).remove();
        }
    }
    
    mode = null;
    currentRoomId = null;
    playerSymbol = null;
    roomRef = null;
    isMyTurn = false;
    gameStarted = false;
    processingMove = false;
    
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('onlineScreen').classList.add('hidden');
    document.getElementById('modeSelection').classList.remove('hidden');
    document.getElementById('roomInfo').classList.add('hidden');
    document.getElementById('roomIdInput').value = '';
    
    resetGame();
}

function checkWinner(currentBoard) {
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (currentBoard[a] && 
            currentBoard[a] === currentBoard[b] && 
            currentBoard[a] === currentBoard[c]) {
            return { winner: currentBoard[a], line: pattern };
        }
    }
    
    if (currentBoard.every(cell => cell !== null)) {
        return { winner: 'draw', line: [] };
    }
    
    return null;
}

function makeComputerMove(currentBoard) {
    const emptyCells = currentBoard.map((cell, idx) => cell === null ? idx : null).filter(val => val !== null);
    if (emptyCells.length === 0) return undefined;
    
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        const values = [currentBoard[a], currentBoard[b], currentBoard[c]];
        if (values.filter(v => v === 'O').length === 2 && values.includes(null)) {
            return pattern.find(idx => currentBoard[idx] === null);
        }
    }
    
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        const values = [currentBoard[a], currentBoard[b], currentBoard[c]];
        if (values.filter(v => v === 'X').length === 2 && values.includes(null)) {
            return pattern.find(idx => currentBoard[idx] === null);
        }
    }
    
    if (currentBoard[4] === null) return 4;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function updateBoard() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, idx) => {
        cell.textContent = board[idx] || '';
        cell.className = 'cell';
        
        if (board[idx]) {
            cell.classList.add(board[idx].toLowerCase());
            cell.disabled = true;
        } else {
            if (mode === 'online') {
                // CRITICAL: Disable if not my turn OR if processing a move
                cell.disabled = !isMyTurn || winner !== null || processingMove;
            } else {
                cell.disabled = winner !== null || isComputerThinking;
            }
        }
        
        if (winningLine.includes(idx)) {
            cell.classList.add('winning');
        }
    });
}

function updateStatus() {
    const currentTurn = document.getElementById('currentTurn');
    
    if (winner) {
        currentTurn.className = 'status-box winner';
        if (winner === 'draw') {
            currentTurn.innerHTML = "It's a Draw!";
        } else {
            if (mode === 'online') {
                currentTurn.innerHTML = winner === playerSymbol ? '🎉 You Win! 🎉' : '😔 You Lose!';
            } else {
                currentTurn.innerHTML = `${winner} Wins!`;
            }
        }
    } else {
        currentTurn.className = 'status-box';
        if (mode === 'online') {
            if (processingMove) {
                currentTurn.innerHTML = '⏳ Sending move...';
            } else {
                currentTurn.innerHTML = isMyTurn ? '✨ Your Turn ✨' : "⏳ Opponent's Turn";
            }
        } else {
            currentTurn.innerHTML = `Current Turn: <span id="turnPlayer" class="turn-player">${isXNext ? 'X' : 'O'}</span>`;
        }
    }
}

function handleClick(idx) {
    console.log("\n🖱️ CLICK on cell", idx);
    console.log("Board[" + idx + "]:", board[idx]);
    console.log("My turn?", isMyTurn);
    console.log("Processing?", processingMove);
    console.log("Game started?", gameStarted);
    
    if (board[idx] !== null) {
        console.log("❌ Cell occupied");
        return;
    }
    
    if (winner) {
        console.log("❌ Game over");
        return;
    }
    
    if (mode === 'online') {
        if (!gameStarted) {
            console.log("❌ Game not started");
            return;
        }
        
        if (processingMove) {
            console.log("❌ Already processing a move");
            return;
        }
        
        if (!isMyTurn) {
            console.log("❌ Not your turn");
            return;
        }
        
        console.log("✅ Making move as", playerSymbol);
        
        // Set processing flag IMMEDIATELY
        processingMove = true;
        
        // Update local board immediately for responsiveness
        board[idx] = playerSymbol;
        updateBoard();
        updateStatus();
        
        // Create new board for Firebase
        const newBoard = [...board];
        
        // Check winner
        const result = checkWinner(newBoard);
        const newWinner = result ? result.winner : null;
        const newWinningLine = result ? result.line : [];
        
        // Next turn
        const nextTurn = playerSymbol === 'X' ? 'O' : 'X';
        
        console.log("📤 Sending to Firebase:", {
            idx: idx,
            symbol: playerSymbol,
            nextTurn: nextTurn,
            winner: newWinner
        });
        
        // Send to Firebase
        roomRef.update({
            board: newBoard,
            currentTurn: nextTurn,
            winner: newWinner,
            winningLine: newWinningLine
        }).then(() => {
            console.log("✅ Firebase updated successfully");
        }).catch((error) => {
            console.error("❌ Firebase error:", error);
            // Revert on error
            board[idx] = null;
            processingMove = false;
            updateBoard();
            updateStatus();
            alert("Error! Please try again.");
        });
        
    } else if (mode === 'single') {
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
        updateBoard();
        updateStatus();
        
        setTimeout(() => {
            const computerMove = makeComputerMove(board);
            if (computerMove !== undefined) {
                board[computerMove] = 'O';
                const computerResult = checkWinner(board);
                if (computerResult) {
                    winner = computerResult.winner;
                    winningLine = computerResult.line;
                }
            }
            isXNext = true;
            isComputerThinking = false;
            updateBoard();
            updateStatus();
        }, 500);
        
    } else if (mode === 'two') {
        board[idx] = isXNext ? 'X' : 'O';
        const result = checkWinner(board);
        if (result) {
            winner = result.winner;
            winningLine = result.line;
            updateBoard();
            updateStatus();
            return;
        }
        isXNext = !isXNext;
        updateBoard();
        updateStatus();
    }
}

function resetGame() {
    board = Array(9).fill(null);
    isXNext = true;
    winner = null;
    winningLine = [];
    isComputerThinking = false;
    processingMove = false;
    
    if (mode === 'online' && roomRef && gameStarted) {
        isMyTurn = (playerSymbol === 'X');
        roomRef.update({
            board: Array(9).fill(null),
            currentTurn: 'X',
            winner: null,
            winningLine: []
        });
    }
    
    updateBoard();
    updateStatus();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ Page loaded");
    
    const singleBtn = document.getElementById('singlePlayerBtn');
    const twoBtn = document.getElementById('twoPlayerBtn');
    const onlineBtn = document.getElementById('onlinePlayerBtn');
    
    if (singleBtn) singleBtn.onclick = () => selectMode('single');
    if (twoBtn) twoBtn.onclick = () => selectMode('two');
    if (onlineBtn) onlineBtn.onclick = () => selectMode('online');
    
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    
    if (createRoomBtn) createRoomBtn.onclick = createRoom;
    if (joinRoomBtn) joinRoomBtn.onclick = joinRoom;
    if (copyRoomIdBtn) copyRoomIdBtn.onclick = copyRoomId;
    if (backToMenuBtn) backToMenuBtn.onclick = goToMenu;
    
    const homeBtn = document.getElementById('homeBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    if (homeBtn) homeBtn.onclick = goToMenu;
    if (resetBtn) resetBtn.onclick = resetGame;
    
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.onclick = (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            handleClick(index);
        };
    });
    
    console.log("✅ Event listeners ready");
});
