import {Application} from "./application.ts";
import {serveFile} from "https://deno.land/std@0.79.0/http/file_server.ts";
import {main as crawlerMain} from "./crawler.ts";
import {createSingleLock} from "./lock.ts";

const port = parseInt(Deno.env.get("PORT") || "") || 4000;
const selfUrl = `http://localhost:${port}`;
const app = new Application({port});
console.log(`Creating server at ${selfUrl}`);

async function healthCheck(url: string): Promise<boolean> {
  try {
    const res = await fetch(url + "/health");
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function notify(url: string): Promise<void> {
  return fetch(url + "/nodes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: selfUrl,
    }),
  }).then((res) => {
    console.log("Register status: " + res.status);
  }).catch((reason) => {
    console.log("Register failed: " + reason);
  });
}

app.router.handle("GET", "/health", async () => ({
  headers: new Headers({"Content-Type": "application/json"}),
  body: JSON.stringify({status: "OK"}),
}));

app.router.handle("GET", "/profile.png", async (req) => (
  serveFile(req, "./profile.png").then(res => {
    res.headers!.set("Content-Type", "image/png"); // Deno serveFile MEDIA_TYPES does not include .png
    return res;
  })
));

app.router.handle("GET", "/metadata", async () => ({
  headers: new Headers({"Content-Type": "application/json"}),
  body: JSON.stringify({
    name: "Eriks Deno node",
    owner: "Erik Vesteraas",
    description: "Node written in Deno (https://deno.land/). Was actually the very first proof of concept node written for DDD.",
    services: [
      "/health",
      "/metadata",
      "/nodes",
    ],
  }),
}));

app.router.handle("GET", "/", async (req) => (
  serveFile(req, "index.html")
));

const knownUrls: Set<string> = new Set<string>();

app.router.handle("POST", "/nodes", async (req) => {
  let body = JSON.parse(
    new TextDecoder("utf-8").decode(await Deno.readAll(req.body)),
  );
  const nodeUrl = body.url;
  if (nodeUrl && await healthCheck(nodeUrl)) {
    knownUrls.add(nodeUrl);
    return {
      body: `"Registered"`,
    };
  } else {
    return {
      status: 400,
      body: `"Bad request"`,
    };
  }
});

app.router.handle("GET", "/nodes", async () => ({
  headers: new Headers({"Content-Type": "application/json"}),
  body: JSON.stringify(Array.from(knownUrls)),
}));

let lastCrawlerRun: undefined | number = undefined;
const generationLock = createSingleLock();
app.router.handle("GET", "/network.svg", async (req) => {

  await generationLock(async () => {
    // only generate once an hour and only if requested:
    if (!lastCrawlerRun || (lastCrawlerRun + 3_600_000) < Date.now()) {
      console.log("[/network.svg] Generating new file");
      await crawlerMain();
      const process = Deno.run({cmd: ["neato", "-Tsvg", "-o", "network.svg", "network.dot"]});
      await process.status();
      console.log("[/network.svg] Finished generating");
      lastCrawlerRun = Date.now();
    } else {
      console.log(`[/network.svg] Serving file generated ${Math.round((Date.now() - lastCrawlerRun) / 60_000)} minutes ago`);
    }
  });

  return serveFile(req, "network.svg").then(res => {
    res.headers!.set("Content-Type", "image/svg+xml");
    return res;
  });
});

app.router.handle("GET", /\/images\/[a-z0-9\-.]+\.png/, async (req, pathname) => {
  return serveFile(req, "." + pathname).then(res => {
    res.headers!.set("Content-Type", "image/png"); // Deno serveFile MEDIA_TYPES does not include .png
    return res;
  });
})

setInterval(() => {
  knownUrls.forEach(async (nodeUrl) => {
    if (!await healthCheck(nodeUrl)) {
      knownUrls.delete(nodeUrl);
    }
  });
}, 60_000);

const notifyUrls = Deno.env.get("NOTIFY_URLS");
if (notifyUrls) {
  setTimeout(() => {
    notifyUrls.split(",").forEach(url => {
      const _ = notify(url);
    })
  }, 500);
}

await app.listen();
