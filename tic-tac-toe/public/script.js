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
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
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
            alert('Firebase is not configured. Please add your Firebase config to script.js');
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
    
    roomRef = db.ref('rooms/' + currentRoomId);
    
    const initialData = {
        board: Array(9).fill(null),
        players: 1,
        currentTurn: 'X',
        winner: null,
        winningLine: [],
        playerX: true,
        playerO: false,
        gameStarted: false,
        createdAt: Date.now()
    };
    
    roomRef.set(initialData).then(() => {
        console.log("Room created:", currentRoomId, initialData);
    }).catch((error) => {
        console.error("Error creating room:", error);
    });
    
    document.getElementById('displayRoomId').textContent = currentRoomId;
    document.getElementById('roomInfo').classList.remove('hidden');
    document.getElementById('waitingMessage').style.display = 'block';
    document.getElementById('playerRole').textContent = 'You are: X';
    
    // Listen for second player and game updates
    roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        console.log("📡 Room data updated:", data);
        
        // Check if second player joined
        if (data.players === 2 && !gameStarted) {
            gameStarted = true;
            console.log("🎮 Second player joined! Starting game...");
            
            // Update gameStarted in Firebase
            roomRef.update({ gameStarted: true });
            
            document.getElementById('waitingMessage').style.display = 'none';
            startOnlineGame();
        } else if (gameStarted) {
            // Update game state
            updateOnlineGame(data);
        }
    });
}

function joinRoom() {
    const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
    console.log("Attempting to join room:", roomId);
    
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
            console.error("Room not found:", roomId);
            return;
        }
        
        if (data.players >= 2) {
            alert('Room is full!');
            console.error("Room is full:", roomId);
            return;
        }
        
        playerSymbol = 'O';
        isMyTurn = false;  // O goes second
        gameStarted = true;
        
        console.log("Joining as player O");
        
        roomRef.update({
            players: 2,
            playerO: true,
            gameStarted: true
        }).then(() => {
            console.log("✅ Joined room successfully as O");
            console.log("Current turn is:", data.currentTurn);
            console.log("My turn will be when currentTurn is: O");
        });
        
        document.getElementById('displayRoomId').textContent = currentRoomId;
        document.getElementById('roomInfo').classList.remove('hidden');
        document.getElementById('waitingMessage').style.display = 'none';
        document.getElementById('playerRole').textContent = 'You are: O';
        
        startOnlineGame();
        
        // Listen for game updates
        roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                console.log("📡 Room update received:", data);
                updateOnlineGame(data);
            }
        });
    }).catch((error) => {
        console.error("Error joining room:", error);
        alert('Error joining room. Please try again.');
    });
}

function startOnlineGame() {
    console.log("Starting online game as:", playerSymbol);
    document.getElementById('onlineScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    
    const modeTitle = document.getElementById('modeTitle');
    const playerInfo = document.getElementById('playerInfo');
    
    modeTitle.textContent = 'Online Match - Room: ' + currentRoomId;
    playerInfo.innerHTML = `You are: <span class="player-${playerSymbol.toLowerCase()}">${playerSymbol}</span>`;
    playerInfo.style.display = 'block';
    
    // Initialize the board
    board = Array(9).fill(null);
    winner = null;
    winningLine = [];
    isXNext = true;
    isMyTurn = (playerSymbol === 'X');
    
    updateBoard();
    updateStatus();
}

function updateOnlineGame(data) {
    if (!data || !gameStarted) return;
    
    console.log("Updating online game with data:", data);
    console.log("Current turn in Firebase:", data.currentTurn, "I am:", playerSymbol);
    
    // Update local state from Firebase
    board = data.board || Array(9).fill(null);
    winner = data.winner || null;
    winningLine = data.winningLine || [];
    isXNext = data.currentTurn === 'X';
    
    // Determine if it's my turn - CRITICAL FIX
    isMyTurn = (data.currentTurn === playerSymbol) && (winner === null);
    
    console.log("Is it my turn?", isMyTurn, "Winner:", winner);
    
    updateBoard();
    updateStatus();
}

function copyRoomId() {
    const roomId = document.getElementById('displayRoomId').textContent;
    navigator.clipboard.writeText(roomId).then(() => {
        alert('Room ID copied to clipboard!');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = roomId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Room ID copied to clipboard!');
    });
}

function goToMenu() {
    console.log("Going to menu");
    
    // Clean up online game
    if (roomRef) {
        roomRef.off();
        if (currentRoomId && mode === 'online') {
            // Only delete room if we're the creator (player X)
            if (playerSymbol === 'X') {
                db.ref('rooms/' + currentRoomId).remove();
            }
        }
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

function checkWinner(currentBoard) {
    // Check all winning patterns
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (currentBoard[a] && 
            currentBoard[a] === currentBoard[b] && 
            currentBoard[a] === currentBoard[c]) {
            return { winner: currentBoard[a], line: pattern };
        }
    }
    
    // Check for draw - all cells filled
    const isFull = currentBoard.every(cell => cell !== null);
    if (isFull) {
        return { winner: 'draw', line: [] };
    }
    
    return null;
}

function makeComputerMove(currentBoard) {
    const emptyCells = currentBoard.map((cell, idx) => cell === null ? idx : null).filter(val => val !== null);
    
    if (emptyCells.length === 0) return undefined;
    
    // Try to win
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        const values = [currentBoard[a], currentBoard[b], currentBoard[c]];
        
        if (values.filter(v => v === 'O').length === 2 && values.includes(null)) {
            return pattern.find(idx => currentBoard[idx] === null);
        }
    }
    
    // Block player
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        const values = [currentBoard[a], currentBoard[b], currentBoard[c]];
        
        if (values.filter(v => v === 'X').length === 2 && values.includes(null)) {
            return pattern.find(idx => currentBoard[idx] === null);
        }
    }
    
    // Take center if available
    if (currentBoard[4] === null) return 4;
    
    // Random move
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
                cell.disabled = !isMyTurn || winner !== null;
            } else {
                cell.disabled = winner !== null || isComputerThinking;
            }
        }
        
        if (winningLine.includes(idx)) {
            cell.classList.add('winning');
        }
    });
    
    const turnPlayer = document.getElementById('turnPlayer');
    if (turnPlayer) {
        turnPlayer.textContent = isXNext ? 'X' : 'O';
    }
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
            currentTurn.innerHTML = isMyTurn ? '✨ Your Turn ✨' : "⏳ Opponent's Turn";
        } else {
            currentTurn.innerHTML = `Current Turn: <span id="turnPlayer" class="turn-player">${isXNext ? 'X' : 'O'}</span>`;
        }
    }
}

function handleClick(idx) {
    console.log("Cell clicked:", idx);
    console.log("Mode:", mode);
    console.log("My turn:", isMyTurn);
    console.log("My symbol:", playerSymbol);
    console.log("Cell value:", board[idx]);
    console.log("Winner:", winner);
    console.log("Game started:", gameStarted);
    
    // Basic validation
    if (board[idx] !== null) {
        console.log("❌ Click ignored - cell already occupied");
        return;
    }
    
    if (winner) {
        console.log("❌ Click ignored - game already over");
        return;
    }
    
    if (isComputerThinking) {
        console.log("❌ Click ignored - computer is thinking");
        return;
    }
    
    if (mode === 'online') {
        if (!gameStarted) {
            console.log("❌ Click ignored - game not started yet!");
            alert("Waiting for opponent to join...");
            return;
        }
        
        if (!isMyTurn) {
            console.log("❌ Click ignored - not your turn!");
            console.log("Current turn should be:", playerSymbol);
            return;
        }
        
        console.log("✅ Making online move as", playerSymbol, "at position", idx);
        
        // Make the move locally first
        const newBoard = [...board];
        newBoard[idx] = playerSymbol;
        
        console.log("New board state:", newBoard);
        
        // Check for winner
        const result = checkWinner(newBoard);
        let newWinner = null;
        let newWinningLine = [];
        
        if (result) {
            newWinner = result.winner;
            newWinningLine = result.line;
            console.log("🎮 Game over! Winner:", newWinner);
        }
        
        // Determine next turn
        const nextTurn = playerSymbol === 'X' ? 'O' : 'X';
        console.log("Next turn will be:", nextTurn);
        
        // Update Firebase with atomic update
        const updates = {
            board: newBoard,
            currentTurn: nextTurn,
            winner: newWinner,
            winningLine: newWinningLine
        };
        
        console.log("Sending to Firebase:", updates);
        
        // Optimistically update local state
        board = newBoard;
        winner = newWinner;
        winningLine = newWinningLine;
        isMyTurn = false;
        updateBoard();
        updateStatus();
        
        // Update Firebase
        roomRef.update(updates).then(() => {
            console.log("✅ Move sent to Firebase successfully");
        }).catch((error) => {
            console.error("❌ Error updating Firebase:", error);
            alert("Error sending move. Please try again.");
            // Reload game state from Firebase
            roomRef.once('value').then(snapshot => {
                const data = snapshot.val();
                if (data) updateOnlineGame(data);
            });
        });
        
    } else if (mode === 'single') {
        console.log("Single player move");
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
        console.log("Two player local move");
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
    console.log("Resetting game");
    board = Array(9).fill(null);
    isXNext = true;
    winner = null;
    winningLine = [];
    isComputerThinking = false;
    
    if (mode === 'online' && roomRef && gameStarted) {
        isMyTurn = (playerSymbol === 'X');
        roomRef.update({
            board: Array(9).fill(null),
            currentTurn: 'X',
            winner: null,
            winningLine: []
        }).then(() => {
            console.log("Game reset in Firebase");
        });
    }
    
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.disabled = false;
    });
    
    updateBoard();
    updateStatus();
}

// Setup event listeners after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("Page loaded - Setting up event listeners");
    
    // Mode selection buttons
    const singleBtn = document.getElementById('singlePlayerBtn');
    const twoBtn = document.getElementById('twoPlayerBtn');
    const onlineBtn = document.getElementById('onlinePlayerBtn');
    
    if (singleBtn) {
        singleBtn.addEventListener('click', () => {
            console.log("Single player button clicked");
            selectMode('single');
        });
    }
    if (twoBtn) {
        twoBtn.addEventListener('click', () => {
            console.log("Two player button clicked");
            selectMode('two');
        });
    }
    if (onlineBtn) {
        onlineBtn.addEventListener('click', () => {
            console.log("Online button clicked");
            selectMode('online');
        });
    }
    
    // Online mode buttons
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            console.log("Create room button clicked");
            createRoom();
        });
    }
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            console.log("Join room button clicked");
            joinRoom();
        });
    }
    if (copyRoomIdBtn) {
        copyRoomIdBtn.addEventListener('click', () => {
            console.log("Copy room ID button clicked");
            copyRoomId();
        });
    }
    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            console.log("Back to menu button clicked");
            goToMenu();
        });
    }
    
    // Game buttons
    const homeBtn = document.getElementById('homeBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            console.log("Home button clicked");
            goToMenu();
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            console.log("Reset button clicked");
            resetGame();
        });
    }
    
    // Cell clicks
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            console.log("Cell event listener triggered for index:", index);
            handleClick(index);
        });
    });
    
    console.log("✅ Event listeners setup complete");
    console.log("Found buttons:", {
        singleBtn: !!singleBtn,
        twoBtn: !!twoBtn,
        onlineBtn: !!onlineBtn,
        cells: cells.length
    });
});