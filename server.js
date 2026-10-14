const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const N = 8;
const rooms = new Map();
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];
const COMPLEXO_X = new Set([5,10,15,20,25,30,35,40,45,50,55,60]);

app.use(express.static(__dirname));
app.get("/", (req,res) => res.sendFile(path.join(__dirname,"index.html")));

function inside(r,c){ return r>=0 && r<N && c>=0 && c<N; }
function roomCode(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }

// ========================= EMBOSCADA =========================
function createEmboscada(){
  const board = Array.from({length:N},()=>Array(N).fill(null));
  for(let r=0;r<2;r++) for(let c=0;c<N;c++) if((r+c)%2===0) board[r][c]="W";
  for(let r=6;r<8;r++) for(let c=0;c<N;c++) if((r+c)%2===1) board[r][c]="B";
  return {game:"emboscada",board,turn:"W",score:{W:0,B:0},players:{W:null,B:null},winner:null};
}
function surrounded(board,r,c){
  const p=board[r][c]; if(!p) return false;
  const e=p==="W"?"B":"W";
  return ORTH.filter(([dr,dc])=>inside(r+dr,c+dc)).every(([dr,dc])=>board[r+dr][c+dc]===e);
}
function captureEmboscada(board){
  const captured=[];
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(board[r][c]&&surrounded(board,r,c)) captured.push([r,c,board[r][c]]);
  for(const [r,c] of captured) board[r][c]=null;
  return captured;
}
function embState(room){ return {game:"emboscada",board:room.board,turn:room.turn,score:room.score,winner:room.winner,ready:!!room.players.W&&!!room.players.B}; }

// =========================== COMPLEXO =========================
function createComplexo(){
  const board=Array.from({length:N},()=>Array(N).fill(null));
  // Casas 5,10,15 para cima; 50,55,60 para baixo.
  for(const num of [5,10,15]){ const i=num-1; board[Math.floor(i/8)][i%8]="W"; }
  for(const num of [50,55,60]){ const i=num-1; board[Math.floor(i/8)][i%8]="B"; }
  return {game:"complexo",board,turn:"W",players:{W:null,B:null},destinations:{W:null,B:null},winner:null};
}
function numberAt(r,c){ return r*8+c+1; }
function validDestination(room,r,c){ return inside(r,c) && !COMPLEXO_X.has(numberAt(r,c)) && !room.board[r][c]; }
function countPieces(board,color){ let n=0; for(const row of board) for(const p of row) if(p===color)n++; return n; }
function knightMove(r1,c1,r2,c2){
  const dr=Math.abs(r2-r1),dc=Math.abs(c2-c1);
  return COMPLEXO_X.has(numberAt(r2,c2)) && ((dr===2&&dc===1)||(dr===1&&dc===2));
}
function specialMove(r1,c1,r2,c2){
  // 3 casas retas, depois 1 perpendicular, depois 1 diagonal.
  for(const [dr,dc] of ORTH){
    const a=[r1+dr*3,c1+dc*3];
    if(!inside(...a)) continue;
    const perpendicular = dr===0 ? [[1,0],[-1,0]] : [[0,1],[0,-1]];
    for(const [pr,pc] of perpendicular){
      const b=[a[0]+pr,a[1]+pc];
      if(!inside(...b)) continue;
      for(const [qr,qc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
        if(b[0]+qr===r2 && b[1]+qc===c2) return true;
      }
    }
  }
  return false;
}
function complexoLegal(room,r1,c1,r2,c2,color){
  if(!inside(r1,c1)||!inside(r2,c2)||room.board[r1][c1]!==color) return false;
  if(room.board[r2][c2]===color) return false;
  return knightMove(r1,c1,r2,c2) || specialMove(r1,c1,r2,c2);
}
function complexoState(room){
  return {game:"complexo",board:room.board,turn:room.turn,destinations:room.destinations,winner:room.winner,ready:!!room.players.W&&!!room.players.B};
}

// ============================ SOCKET ============================
io.on("connection",socket=>{
  function playerColor(room){
    if(room.players.W===socket.id) return "W";
    if(room.players.B===socket.id) return "B";
    return null;
  }

  socket.on("create",()=>{
    let code; do{code=roomCode();}while(rooms.has(code));
    const room=createEmboscada(); room.players.W=socket.id; rooms.set(code,room); socket.join(code);
    socket.emit("joined",{room:code,color:"W",...embState(room)});
  });
  socket.on("join",code=>{
    code=String(code||"").trim().toUpperCase(); const room=rooms.get(code);
    if(!room){socket.emit("err","Sala não encontrada.");return;}
    if(room.players.B){socket.emit("err","Esta sala já está cheia.");return;}
    room.players.B=socket.id; socket.join(code); socket.emit("joined",{room:code,color:"B",...embState(room)}); io.to(code).emit("state",embState(room));
  });

  socket.on("complexo:create",()=>{
    let code; do{code=roomCode();}while(rooms.has(code));
    const room=createComplexo(); room.players.W=socket.id; rooms.set(code,room); socket.join(code);
    socket.emit("complexo:joined",{room:code,color:"W",...complexoState(room)});
  });
  socket.on("complexo:join",code=>{
    code=String(code||"").trim().toUpperCase(); const room=rooms.get(code);
    if(!room || room.game!=="complexo"){socket.emit("complexo:err","Sala do COMPLEXO não encontrada.");return;}
    if(room.players.B){socket.emit("complexo:err","Esta sala já está cheia.");return;}
    room.players.B=socket.id; socket.join(code); socket.emit("complexo:joined",{room:code,color:"B",...complexoState(room)}); io.to(code).emit("complexo:state",complexoState(room));
  });

  socket.on("complexo:destination",m=>{
    const room=rooms.get(m?.room), color=room&&playerColor(room); if(!room||room.game!=="complexo"||room.winner||!color)return;
    const r=Number(m.r),c=Number(m.c); if(!Number.isInteger(r)||!Number.isInteger(c)||!validDestination(room,r,c))return;
    if(room.destinations[color])return;
    room.destinations[color]={r,c};
    io.to(m.room).emit("complexo:state",complexoState(room));
  });

  socket.on("complexo:move",m=>{
    const room=rooms.get(m?.room), color=room&&playerColor(room); if(!room||room.game!=="complexo"||room.winner||!color)return;
    if(!room.players.W||!room.players.B||!room.destinations.W||!room.destinations.B)return;
    if(room.turn!==color)return;
    const vals=[m.r1,m.c1,m.r2,m.c2].map(Number); if(!vals.every(Number.isInteger))return;
    const [r1,c1,r2,c2]=vals; if(!complexoLegal(room,r1,c1,r2,c2,color))return;
    const target=room.board[r2][c2];
    // A última peça do adversário não pode ser capturada.
    // A captura de 2 para 1 continua permitida, pois a partida precisa
    // chegar à condição de vitória com o adversário tendo exatamente 1 peça.
    if(target && target!==color && countPieces(room.board,target)===1)return;
    room.board[r2][c2]=color; room.board[r1][c1]=null;
    // Vitória: o adversário já ficou com exatamente 1 peça e a peça chega ao destino do jogador.
    if(room.destinations[color].r===r2 && room.destinations[color].c===c2 && countPieces(room.board,color=== "W"?"B":"W")===1){
      room.winner=color;
    } else {
      room.turn=color==="W"?"B":"W";
    }
    io.to(m.room).emit("complexo:state",complexoState(room));
  });

  socket.on("move",m=>{
    const room=rooms.get(m?.room); if(!room||room.game!=="emboscada"||room.winner)return;
    const color=playerColor(room); if(!color||room.turn!==color)return;
    const vals=[m.r1,m.c1,m.r2,m.c2]; if(!vals.every(Number.isInteger))return; const [r1,c1,r2,c2]=vals;
    if(!inside(r1,c1)||!inside(r2,c2)||room.board[r1][c1]!==color||room.board[r2][c2]||Math.abs(r1-r2)!==1||Math.abs(c1-c2)!==1)return;
    room.board[r2][c2]=color; room.board[r1][c1]=null;
    for(const [r,c,p] of captureEmboscada(room.board)) room.score[p==="W"?"B":"W"]++;
    if(room.score.W>=7)room.winner="W"; else if(room.score.B>=7)room.winner="B"; else room.turn=color==="W"?"B":"W";
    io.to(m.room).emit("state",embState(room));
  });

  socket.on("disconnect",()=>{
    for(const [code,room] of rooms){
      if(room.players.W===socket.id)room.players.W=null;
      if(room.players.B===socket.id)room.players.B=null;
      if(!room.players.W&&!room.players.B)rooms.delete(code);
      else io.to(code).emit(room.game==="complexo"?"complexo:state":"state",room.game==="complexo"?complexoState(room):embState(room));
    }
  });
});

server.listen(PORT,()=>console.log("Jogos online na porta",PORT));
