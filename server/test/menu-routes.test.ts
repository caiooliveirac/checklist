import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Rotas /api/internal/menu/* (menu do bot dos Plantões). Sem banco: cobre a
 * autorização por token e as rotas que só dependem de arquivos (materials) ou
 * do fallback do board (404 de base/material) — getBoard degrada para a lista
 * fixa quando o plantoes não está configurado, exatamente como aqui.
 */

process.env.INTERNAL_API_TOKEN = "token-de-teste";

let app: FastifyInstance;

beforeAll(async () => {
  // Import dinâmico DEPOIS do env acima: config.ts congela o token no load.
  const { registerRoutes } = await import("../src/routes.js");
  app = Fastify();
  await registerRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("menu interno — autorização", () => {
  it("recusa sem o x-internal-token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/internal/menu/materials" });
    expect(res.statusCode).toBe(401);
    expect(res.json().ok).toBe(false);
  });

  it("recusa com token errado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/internal/menu/materials",
      headers: { "x-internal-token": "errado" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("menu interno — payloads", () => {
  const auth = { "x-internal-token": "token-de-teste" };

  it("materials devolve a lista de botões da definição do checklist", async () => {
    const res = await app.inject({ method: "GET", url: "/api/internal/menu/materials", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.materials.length).toBeGreaterThan(10);
    expect(body.materials[0]).toHaveProperty("key");
    expect(body.materials[0]).toHaveProperty("label");
    expect(body.materials[0].key).toMatch(/^g/);
  });

  it("unit com base desconhecida responde 404 deliberado", async () => {
    const res = await app.inject({ method: "GET", url: "/api/internal/menu/unit/XX99", headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("base desconhecida");
  });

  it("material com item desconhecido responde 404 deliberado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/internal/menu/material/SM01/naoexiste",
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("material desconhecido");
  });
});
