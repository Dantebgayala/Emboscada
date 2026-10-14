# EMBOSCADA + COMPLEXO

Projeto Node.js com Express e Socket.IO para dois jogos online no mesmo site.

## Jogos

- `/` — menu **Meus Jogos**
- `/emboscada` — EMBOSCADA
- `/complexo` — COMPLEXO

## Publicação no Render

O projeto usa `npm start`, que executa `node server.js`.

## COMPLEXO

- Tabuleiro 8x8, casas 1 a 64.
- X nas casas múltiplas de 5.
- 3 peças por jogador: brancas nas casas 5, 10 e 15; pretas nas casas 50, 55 e 60.
- Cada jogador escolhe uma casa sem X como destino; o adversário vê o destino.
- Movimento tipo cavalo precisa terminar em X.
- Movimento especial: 3 casas retas + 1 perpendicular + 1 diagonal.
- Peças podem pular outras peças.
- A captura ocorre quando a casa final contém peça inimiga.
- Quando o adversário tem apenas 1 peça, alcançar o próprio destino vence.
