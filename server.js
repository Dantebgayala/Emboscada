const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/emboscada", (req, res) => res.sendFile(path.join(__dirname, "emboscada.html")));
app.get("/complexo", (req, res) => res.sendFile(path.join(__dirname, "complexo.html")));

const rooms = new Map();
const N = 8;
const ORTHOGONAL = [[1,0],[-1,0],[0,1],[0,-1]];
const DIAGONAL = [[1,1],[1,-1],[-1,1],[-1,-1]];

function inside(r,c){ return r>=0 && r<N && c>=0 && c<N; }
function code(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }
function newCode(){ let c; do c=code(); while(rooms.has(c)); return c; }

// ===================== EMBOSCADA =====================
function createEmboscada(){
  const board=Array.from({length:N},()=>Array(N).fill(null));
  for(let r=0;r<2;r++) for(let c=0;c<N;c++) if((r+c)%2===0) board[r][c]="W";
  for(let r=6;r<8;r++) for(let c=0;c<N;c++) if((r+c)%2===1) board[r][c]="B";
  return {game:"emboscada",board,turn:"W",score:{W:0,B:0},players:{W:null,B:null},winner:null};
}
function surrounded(board,r,c){
  const piece=board[r][c]; if(!piece) return false;
  const enemy=piece==="W"?"B":"W";
  return ORTHOGONAL.filter(([dr,dc])=>inside(r+dr,c+dc)).every(([dr,dc])=>board[r+dr][c+dc]===enemy);
}
function captureEmboscada(board){
  const captured=[];
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(board[r][c]&&surrounded(board,r,c)) captured.push([r,c,board[r][c]]);
  for(const [r,c] of captured) board[r][c]=null;
  return captured;
}
function embState(room){ return {game:"emboscada",board:room.board,turn:room.turn,score:room.score,winner:room.winner,ready:!!room.players.W&&!!room.players.B}; }

// ===================== COMPLEXO =====================
const COMPLEXO_X = new Set([5,10,15,20,25,30,35,40,45,50,55,60]);
function num(r,c){ return r*8+c+1; }
function isX(r,c){ return COMPLEXO_X.has(num(r,c)); }
function createComplexo(){
  const board=Array.from({length:N},()=>Array(N).fill(null));
  // Cima: casas 5, 10 e 15. Baixo: 50, 55 e 60.
  for(const n of [5,10,15]) { const i=n-1; board[Math.floor(i/8)][i%8]="W"; }
  for(const n of [50,55,60]) { const i=n-1; board[Math.floor(i/8)][i%8]="B"; }
  return {game:"complexo",board,turn:"W",players:{W:null,B:null},destinations:{W:null,B:null},winner:null};
}
function complexoState(room){
  return {
    game:"complexo", board:room.board, turn:room.turn,
    destinations:room.destinations, winner:room.winner,
    playersReady:!!room.players.W&&!!room.players.B,
    destinationsReady:!!room.destinations.W&&!!room.destinations.B,
    ready:!!room.players.W&&!!room.players.B&&!!room.destinations.W&&!!room.destinations.B
  };
}
function playerColor(room,socketId){
  if(room.players.W===socketId) return "W";
  if(room.players.B===socketId) return "B";
  return null;
}
function pieceCount(board,color){ let n=0; for(const row of board) for(const p of row) if(p===color)n++; return n; }
function targetReached(room,color){
  const target=room.destinations[color];
  if(!target) return false;
  return room.board[target.r][target.c]===color && pieceCount(room.board,color=== "W" ? "B":"W")===1;
}
function validKnightMove(board,r1,c1,r2,c2){
  if(!inside(r2,c2)||isX(r2,c2)) return false;
  const dr=Math.abs(r2-r1), dc=Math.abs(c2-c1);
  return (dr===2&&dc===1)||(dr===1&&dc===2);
}
function validComplexMove(board,r1,c1,r2,c2){
  if(!inside(r1,c1)||!inside(r2,c2)) return false;
  if(validKnightMove(board,r1,c1,r2,c2)) return true;
  // Movimento especial: 3 casas retas, 1 perpendicular e 1 diagonal.
  for(const [dr,dc] of ORTHOGONAL){
    const a={r:r1+dr*3,c:c1+dc*3};
    if(!inside(a.r,a.c)) continue;
    for(const [pr,pc] of ORTHOGONAL){
      if(dr!==0 && pr!==0) continue;
      if(dc!==0 && pc!==0) continue;
      const b={r:a.r+pr,c:a.c+pc};
      if(!inside(b.r,b.c)) continue;
      for(const [qr,qc] of DIAGONAL){
        const f={r:b.r+qr,c:b.c+qc};
        if(f.r===r2&&f.c===c2) return true;
      }
    }
  }
  return false;
}

io.on("connection", socket=>{
  console.log("Jogador conectado:",socket.id);

  socket.on("create",()=>{
    let roomCode=newCode();
    const room=createEmboscada(); room.players.W=socket.id; rooms.set(roomCode,room); socket.join(roomCode);
    socket.emit("joined",{room:roomCode,color:"W",...embState(room)});
  });

  socket.on("join",roomCode=>{
    roomCode=String(roomCode||"").toUpperCase(); const room=rooms.get(roomCode);
    if(!room){ socket.emit("err","Sala não encontrada."); return; }
    if(room.players.B){ socket.emit("err","Esta sala já está cheia."); return; }
    room.players.B=socket.id; socket.join(roomCode);
    socket.emit("joined",{room:roomCode,color:"B",...embState(room)}); io.to(roomCode).emit("state",embState(room));
  });

  socket.on("complexo:create",()=>{
    let roomCode=newCode(); const room=createComplexo(); room.players.W=socket.id; rooms.set(roomCode,room); socket.join(roomCode);
    socket.emit("complexo:joined",{room:roomCode,color:"W",...complexoState(room)});
  });

  socket.on("complexo:join",roomCode=>{
    roomCode=String(roomCode||"").toUpperCase(); const room=rooms.get(roomCode);
    if(!room || room.game!=="complexo"){ socket.emit("complexo:err","Sala de COMPLEXO não encontrada."); return; }
    if(room.players.B){ socket.emit("complexo:err","Esta sala já está cheia."); return; }
    room.players.B=socket.id; socket.join(roomCode);
    socket.emit("complexo:joined",{room:roomCode,color:"B",...complexoState(room)}); io.to(roomCode).emit("complexo:state",complexoState(room));
  });

  socket.on("complexo:destination",data=>{
    const room=rooms.get(data?.room); if(!room||room.game!=="complexo"||room.winner)return;
    const color=playerColor(room,socket.id); if(!color||room.destinations[color])return;
    const r=Number(data.r), c=Number(data.c); if(!Number.isInteger(r)||!Number.isInteger(c)||!inside(r,c)||isX(r,c))return;
    room.destinations[color]={r,c};
    io.to(data.room).emit("complexo:state",complexoState(room));
  });

  socket.on("complexo:move",data=>{
    const room=rooms.get(data?.room); if(!room||room.game!=="complexo"||room.winner)return;
    const color=playerColor(room,socket.id); if(!color||!room.destinations.W||!room.destinations.B||room.turn!==color)return;
    const r1=Number(data.r1),c1=Number(data.c1),r2=Number(data.r2),c2=Number(data.c2);
    if(![r1,c1,r2,c2].every(Number.isInteger)||!inside(r1,c1)||!inside(r2,c2))return;
    if(room.board[r1][c1]!==color)return;
    if(!validComplexMove(room.board,r1,c1,r2,c2))return;
    const target=room.board[r2][c2];
    // A casa final pode conter uma peça inimiga; não pode conter peça própria.
    if(target===color)return;
    room.board[r2][c2]=color; room.board[r1][c1]=null;
    if(target && target!==color) room.board[r2][c2]=color;
    if(targetReached(room,color)) room.winner=color;
    else room.turn=color==="W"?"B":"W";
    io.to(data.room).emit("complexo:state",complexoState(room));
  });

  socket.on("move",move=>{
    const room=rooms.get(move?.room); if(!room||room.game!=="emboscada"||room.winner)return;
    const color=playerColor(room,socket.id); if(!color||room.turn!==color)return;
    const {r1,c1,r2,c2}=move;
    if(![r1,c1,r2,c2].every(Number.isInteger)||!inside(r1,c1)||!inside(r2,c2))return;
    if(room.board[r1][c1]!==color||room.board[r2][c2])return;
    if(Math.abs(r1-r2)!==1||Math.abs(c1-c2)!==1)return;
    room.board[r2][c2]=color; room.board[r1][c1]=null;
    const captured=captureEmboscada(room.board);
    for(const [, ,p] of captured) room.score[p==="W"?"B":"W"]++;
    if(room.score.W>=7)room.winner="W"; else if(room.score.B>=7)room.winner="B"; else room.turn=color==="W"?"B":"W";
    io.to(move.room).emit("state",embState(room));
  });

  socket.on("disconnect",()=>{
    for(const [roomCode,room] of rooms){
      if(room.players.W===socket.id)room.players.W=null;
      if(room.players.B===socket.id)room.players.B=null;
      if(!room.players.W&&!room.players.B)rooms.delete(roomCode);
      else if(room.game==="complexo")io.to(roomCode).emit("complexo:state",complexoState(room));
      else io.to(roomCode).emit("state",embState(room));
    }
  });
});

server.listen(PORT,()=>console.log("Servidor online na porta",PORT));
