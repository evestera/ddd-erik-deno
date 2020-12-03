import {
  HTTPOptions,
  Response,
  serve,
  Server,
  ServerRequest,
} from "https://deno.land/std@0.79.0/http/server.ts";

type RouteHandler = (req: ServerRequest, pathname: string) => Promise<Response>;

class Router {
  private routes: Record<string, Record<string, RouteHandler | undefined> | undefined> = {};
  private patterns: [RegExp, string, RouteHandler][] = [];

  handle(method: string, path: string | RegExp, handler: RouteHandler): void {
    if (path instanceof RegExp) {
      this.patterns.push([path, method, handler])
    } else {
      if (!this.routes[path]) {
        this.routes[path] = {};
      }
      this.routes[path]![method] = handler;
    }
  }

  async route(req: ServerRequest): Promise<void> {
    console.log(req.url);
    const url = new URL("http://dummyhost.test" + req.url); // req.url does not include a host, so is not a valid URL
    const pathname = url.pathname;

    let routeHandler: RouteHandler | undefined = undefined;

    const handlers = this.routes[pathname];
    routeHandler = handlers && handlers[req.method];

    if (!routeHandler) {
      for (let [pattern, method, handler] of this.patterns) {
        if (pattern.test(pathname) && req.method === method) {
          routeHandler = handler;
        }
      }
    }

    try {
      if (routeHandler) {
        try {
          await req.respond(await routeHandler(req, pathname));
        } catch (e) {
          await req.respond({
            status: 500,
            body: "500 - Internal server error",
          });
        }
      } else {
        await req.respond({
          status: 404,
          body: "404 - Page not found",
        });
      }
    } catch (err) {
      console.error("Uncaught error (maybe broken pipe?)");
      console.error(err);
    }
  }
}

export class Application {
  router: Router = new Router();

  constructor(
    private addr: string | HTTPOptions,
  ) {
  }

  async listen() {
    const server: Server = serve(this.addr);

    for await (const req of server) {
      this.router.route(req).catch(err => {
        console.error("Uncaught error (maybe broken pipe?)");
        console.error(err);
      });
    }
  }
}
