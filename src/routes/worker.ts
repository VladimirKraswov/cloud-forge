import { FastifyInstance } from "fastify";
import db from "../db";

export default async function (app: FastifyInstance) {

  app.post("/claim", async (req, reply) => {
    const { token } = req.body as { token?: string };

    if (!token) {
      return reply.code(400).send({ error: "token required" });
    }

    return new Promise((resolve) => {
      db.get(
        "SELECT * FROM tokens WHERE token = ? AND used = 0",
        [token],
        (err, row: any) => {

          if (!row) {
            return resolve({ error: "invalid token" });
          }

          db.run("UPDATE tokens SET used = 1 WHERE token = ?", [token]);

          db.get(
            "SELECT * FROM jobs WHERE id = ?",
            [row.job_id],
            (err2, job: any) => {

              if (!job) {
                return resolve({ error: "job not found" });
              }

              db.run(
                "UPDATE jobs SET status = 'running' WHERE id = ?",
                [job.id]
              );

              resolve({
                job_id: job.id,
                command: job.command
              });
            }
          );
        }
      );
    });
  });

  app.post("/logs", async (req) => {
    const { job_id, message } = req.body as {
      job_id: string;
      message: string;
    };

    db.run(
      "INSERT INTO logs (job_id, message) VALUES (?, ?)",
      [job_id, message]
    );

    const clients = (app as any).wsClients.get(job_id) || [];
    for (const conn of clients) {
      try {
        conn.socket.send(message);
      } catch {}
    }

    return { ok: true };
  });

  app.post("/finish", async (req) => {
    const { job_id, status } = req.body as {
      job_id: string;
      status?: string;
    };

    db.run(
      "UPDATE jobs SET status = ? WHERE id = ?",
      [status || "finished", job_id]
    );

    return { ok: true };
  });
}