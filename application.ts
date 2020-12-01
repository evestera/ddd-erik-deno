import {
  HTTPOptions,
  Response,
  serve,
  Server,
  ServerRequest,
} from "https://deno.land/std@0.74.0/http/server.ts";

type RouteHandler = (req: ServerRequest) => Promise<Response>;

class Router {
  private routes: Record<string, Record<string, RouteHandler | undefined> | undefined> = {};

  handle(method: string, path: string, handler: RouteHandler): void {
    if (!this.routes[path]) {
      this.routes[path] = {};
    }
    this.routes[path]![method] = handler;
  }

  async route(req: ServerRequest): Promise<void> {
    console.log(req.url);
    const url = new URL("http://dummyhost.test" + req.url); // req.url does not include a host, so is not a valid URL
    const handlers = this.routes[url.pathname];
    const routeHandler = handlers && handlers[req.method];
    if (routeHandler) {
      try {
        req.respond(await routeHandler(req));
      } catch (e) {
        req.respond({
          status: 500,
          body: "500 - Internal server error",
        });
      }
    } else {
      req.respond({
        status: 404,
        body: "404 - Page not found",
      });
    }
  }
}

export class Application {
  router: Router = new Router();

  constructor(
    private addr: string | HTTPOptions,
  ) {}

  async listen() {
    const server: Server = serve(this.addr);

    for await (const req of server) {
      await this.router.route(req);
    }
  }
}
