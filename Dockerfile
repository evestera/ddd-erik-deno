FROM hayd/alpine-deno:1.5.4
WORKDIR /app
USER deno

ADD . .
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache server.ts

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "server.ts"]
