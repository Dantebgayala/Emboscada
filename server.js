const express=require("express"),http=require("http"),{Server}=require("socket.io");
const app=express(),server=http.createServer(app),io=new Server(server);app.use(express.static("public"));
const rooms=new Map(),N=8,O=[[1,0],[-1,0],[0,1],[0,-1]];
function fresh(){let b=Array.from({length:N},()=>Array(N).fill(null));for(let r=0;r<2;r++)for(let c=0;c<N;c++)if((r+c)%2===0)b[r][c]="W";for(let r=6;r<8;r++)for(let c=0;c<N;c++)if((r+c)%2)b[r][c]="B";return{board:b,turn:"W",score:{W:0,B:0},players:{W:null,B:null},winner:null}}
function code(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function view(x){return{board:x.board,turn:x.turn,score:x.score,winner:x.winner,ready:!!x.players.W&&!!x.players.B}}
function inside(r,c){return r>=0&&r<N&&c>=0&&c<N}
function surrounded(b,r,c){let p=b[r][c],e=p==="W"?"B":"W",s=O.filter(([dr,dc])=>inside(r+dr,c+dc));return s.every(([dr,dc])=>b[r+dr][c+dc]===e)}
function capture(b){let out=[];for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(b[r][c]&&surrounded(b,r,c))out.push([r,c,b[r][c]]);for(const[r,c,p]of out)b[r][c]=null;return out}
io.on("connection",s=>{
 s.on("create",()=>{let id;do{id=code()}while(rooms.has(id));let x=fresh();x.players.W=s.id;rooms.set(id,x);s.join(id);s.emit("joined",{room:id,color:"W",...view(x)})});
 s.on("join",id=>{id=String(id||"").toUpperCase();let x=rooms.get(id);if(!x)return s.emit("err","Sala não encontrada.");if(x.players.B)return s.emit("err","Sala cheia.");x.players.B=s.id;s.join(id);s.emit("joined",{room:id,color:"B",...view(x)});io.to(id).emit("state",view(x))});
 s.on("move",m=>{let x=rooms.get(m.room);if(!x||x.winner)return;let p=x.players.W===s.id?"W":x.players.B===s.id?"B":null;if(!p||p!==x.turn)return;
  let{r1,c1,r2,c2}=m;if(![r1,c1,r2,c2].every(Number.isInteger)||!inside(r1,c1)||!inside(r2,c2))return;if(x.board[r1][c1]!==p||x.board[r2][c2]||Math.abs(r1-r2)!==1||Math.abs(c1-c2)!==1)return;
  x.board[r2][c2]=p;x.board[r1][c1]=null;
  // Verifica todas as peças: centro exige 4 vizinhos, borda 3 e canto 2.
  // Assim, entrar em uma casa já cercada também remove imediatamente a peça.
  const caps=capture(x.board);
  for(const[, ,victim]of caps)x.score[victim==="W"?"B":"W"]++;
  if(x.score.W>=7)x.winner="W";else if(x.score.B>=7)x.winner="B";else x.turn=p==="W"?"B":"W";
  io.to(m.room).emit("state",view(x));
 });
 s.on("disconnect",()=>{for(const[id,x]of rooms){if(x.players.W===s.id)x.players.W=null;if(x.players.B===s.id)x.players.B=null;if(!x.players.W&&!x.players.B)rooms.delete(id);else io.to(id).emit("state",view(x))}});
});
server.listen(process.env.PORT||3000,()=>console.log("EMBOSCADA online"));