import { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import db from "../db";

export default async function (app: FastifyInstance) {

  app.post("/jobs", async (req) => {
    const id = "job_" + uuidv4();
    const token = "run_" + uuidv4();
    const command = (req.body as any)?.command || "echo hello";

    return new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO jobs (id, status, command) VALUES (?, ?, ?)",
        [id, "pending", command],
        (err) => {
          if (err) return reject(err);

          db.run(
            "INSERT INTO tokens (token, job_id) VALUES (?, ?)",
            [token, id],
            (err2) => {
              if (err2) return reject(err2);
              resolve({ job_id: id, run_token: token });
            }
          );
        }
      );
    });
  });

  app.get("/jobs/:id", async (req) => {
    const { id } = req.params as any;

    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM logs WHERE job_id = ? ORDER BY id ASC",
        [id],
        (err, logs) => {
          if (err) return reject(err);

          db.get(
            "SELECT * FROM jobs WHERE id = ?",
            [id],
            (err2, job) => {
              if (err2) return reject(err2);
              resolve({ job, logs });
            }
          );
        }
      );
    });
  });
}