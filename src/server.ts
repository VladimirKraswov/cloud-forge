import Fastify from "fastify";

const app = Fastify({ logger: true });

app.register(require("@fastify/websocket"));

app.register(require("./routes/ws"));
app.register(require("./routes/jobs"));
app.register(require("./routes/worker"));

app.listen({ port: 3000 }, (err) => {
  if (err) throw err;
  console.log("Server running on http://localhost:3000");
});