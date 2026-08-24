const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ==========================================
// MOSTRAR O INDEX.HTML
// ==========================================

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==========================================
// CONFIGURAÇÕES DO JOGO
// ==========================================

const rooms = new Map();

const N = 8;

const ORTHOGONAL_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

// ==========================================
// CRIAR UM NOVO JOGO
// ==========================================

function createGame() {

  const board = Array.from(
    { length: N },
    () => Array(N).fill(null)
  );

  // Peças brancas
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < N; col++) {

      if ((row + col) % 2 === 0) {
        board[row][col] = "W";
      }

    }
  }

  // Peças pretas
  for (let row = 6; row < 8; row++) {
    for (let col = 0; col < N; col++) {

      if ((row + col) % 2 === 1) {
        board[row][col] = "B";
      }

    }
  }

  return {
    board: board,

    turn: "W",

    score: {
      W: 0,
      B: 0
    },

    players: {
      W: null,
      B: null
    },

    winner: null
  };
}

// ==========================================
// GERAR CÓDIGO DA SALA
// ==========================================

function createRoomCode() {

  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

}

// ==========================================
// VERIFICAR SE POSIÇÃO ESTÁ NO TABULEIRO
// ==========================================

function insideBoard(row, col) {

  return (
    row >= 0 &&
    row < N &&
    col >= 0 &&
    col < N
  );

}

// ==========================================
// VERIFICAR SE UMA PEÇA ESTÁ CERCADA
//
// Centro = 4 lados
// Borda = 3 lados
// Canto = 2 lados
// ==========================================

function isSurrounded(board, row, col) {

  const piece = board[row][col];

  if (!piece) {
    return false;
  }

  const enemy =
    piece === "W"
      ? "B"
      : "W";

  const validSides =
    ORTHOGONAL_DIRECTIONS.filter(
      ([rowDirection, colDirection]) => {

        return insideBoard(
          row + rowDirection,
          col + colDirection
        );

      }
    );

  return validSides.every(
    ([rowDirection, colDirection]) => {

      return (
        board[row + rowDirection]
             [col + colDirection]
        === enemy
      );

    }
  );

}

// ==========================================
// CAPTURAR PEÇAS CERCADAS
// ==========================================

function capturePieces(board) {

  const captured = [];

  for (let row = 0; row < N; row++) {

    for (let col = 0; col < N; col++) {

      if (
        board[row][col] &&
        isSurrounded(board, row, col)
      ) {

        captured.push([
          row,
          col,
          board[row][col]
        ]);

      }

    }

  }

  // Remover todas as peças capturadas

  for (const [row, col] of captured) {

    board[row][col] = null;

  }

  return captured;
}

// ==========================================
// ESTADO ENVIADO AOS JOGADORES
// ==========================================

function getGameState(room) {

  return {

    board: room.board,

    turn: room.turn,

    score: room.score,

    winner: room.winner,

    ready:
      !!room.players.W &&
      !!room.players.B

  };

}

// ==========================================
// SOCKET.IO
// ==========================================

io.on("connection", (socket) => {

  console.log(
    "Jogador conectado:",
    socket.id
  );

  // ----------------------------------------
  // CRIAR SALA
  // ----------------------------------------

  socket.on("create", () => {

    let roomCode;

    do {

      roomCode = createRoomCode();

    } while (rooms.has(roomCode));

    const room = createGame();

    room.players.W = socket.id;

    rooms.set(
      roomCode,
      room
    );

    socket.join(roomCode);

    socket.emit(
      "joined",
      {
        room: roomCode,
        color: "W",
        ...getGameState(room)
      }
    );

  });

  // ----------------------------------------
  // ENTRAR EM UMA SALA
  // ----------------------------------------

  socket.on(
    "join",
    (roomCode) => {

      roomCode =
        String(roomCode || "")
          .toUpperCase();

      const room =
        rooms.get(roomCode);

      if (!room) {

        socket.emit(
          "err",
          "Sala não encontrada."
        );

        return;

      }

      if (room.players.B) {

        socket.emit(
          "err",
          "Esta sala já está cheia."
        );

        return;

      }

      room.players.B =
        socket.id;

      socket.join(roomCode);

      socket.emit(
        "joined",
        {
          room: roomCode,
          color: "B",
          ...getGameState(room)
        }
      );

      io.to(roomCode).emit(
        "state",
        getGameState(room)
      );

    }
  );

  // ----------------------------------------
  // MOVIMENTO
  // ----------------------------------------

  socket.on(
    "move",
    (move) => {

      const room =
        rooms.get(move.room);

      if (
        !room ||
        room.winner
      ) {
        return;
      }

      let playerColor = null;

      if (
        room.players.W === socket.id
      ) {

        playerColor = "W";

      } else if (
        room.players.B === socket.id
      ) {

        playerColor = "B";

      }

      // Não é a vez do jogador

      if (
        !playerColor ||
        room.turn !== playerColor
      ) {
        return;
      }

      const {
        r1,
        c1,
        r2,
        c2
      } = move;

      // Verificar coordenadas

      if (
        ![
          r1,
          c1,
          r2,
          c2
        ].every(Number.isInteger)
      ) {
        return;
      }

      if (
        !insideBoard(r1, c1) ||
        !insideBoard(r2, c2)
      ) {
        return;
      }

      // Verificar peça

      if (
        room.board[r1][c1]
        !== playerColor
      ) {
        return;
      }

      // Destino precisa estar vazio

      if (
        room.board[r2][c2]
      ) {
        return;
      }

      // Movimento precisa ser diagonal
      // e apenas uma casa

      if (
        Math.abs(r1 - r2) !== 1 ||
        Math.abs(c1 - c2) !== 1
      ) {
        return;
      }

      // --------------------------------------
      // REALIZAR MOVIMENTO
      // --------------------------------------

      room.board[r2][c2] =
        playerColor;

      room.board[r1][c1] =
        null;

      // --------------------------------------
      // VERIFICAR CAPTURAS
      //
      // Inclui:
      // - peça inimiga cercada
      // - peça que entrou em uma casa cercada
      // --------------------------------------

      const captured =
        capturePieces(room.board);

      // Dar pontos ao adversário
      // de cada peça capturada

      for (
        const [
          row,
          col,
          capturedPiece
        ] of captured
      ) {

        const capturer =
          capturedPiece === "W"
            ? "B"
            : "W";

        room.score[capturer]++;

      }

      // --------------------------------------
      // VERIFICAR VITÓRIA
      // --------------------------------------

      if (
        room.score.W >= 7
      ) {

        room.winner = "W";

      } else if (
        room.score.B >= 7
      ) {

        room.winner = "B";

      } else {

        // Trocar turno

        room.turn =
          playerColor === "W"
            ? "B"
            : "W";

      }

      // Enviar atualização
      // para os dois jogadores

      io.to(move.room).emit(
        "state",
        getGameState(room)
      );

    }
  );

  // =========================================
  // DESCONECTAR JOGADOR
  // =========================================

  socket.on(
    "disconnect",
    () => {

      console.log(
        "Jogador desconectado:",
        socket.id
      );

      for (
        const [roomCode, room]
        of rooms
      ) {

        if (
          room.players.W === socket.id
        ) {

          room.players.W = null;

        }

        if (
          room.players.B === socket.id
        ) {

          room.players.B = null;

        }

        // Apagar sala vazia

        if (
          !room.players.W &&
          !room.players.B
        ) {

          rooms.delete(roomCode);

        } else {

          io.to(roomCode).emit(
            "state",
            getGameState(room)
          );

        }

      }

    }
  );

});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

server.listen(
  PORT,
  () => {

    console.log(
      "EMBOSCADA online na porta",
      PORT
    );

  }
);
