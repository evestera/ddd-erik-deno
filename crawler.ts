function normalizeUrl(url: string): string {
  return url
    .replace(/\/+$/, "")
    .replace(".gq/nodes", ".gq")
}

async function getNodes(url: string): Promise<string[]> {
  try {
    const res = await fetch(url + "/nodes");
    if (res.status !== 200) {
      console.error(`nodes: HTTP status ${res.status} ${res.statusText} from ${url}`)
      return [];
    }
    const json = await res.json();
    if (!Array.isArray(json)) {
      console.error(`nodes: Bad result from ${url}: ${json}`);
      return [];
    }
    return Array.from(
      new Set(
        json.map(normalizeUrl).filter(nodeUrl => nodeUrl != url)
      )
    );
  } catch (e) {
    console.error(`nodes: Error from ${url}:`);
    console.error(e);
    return [];
  }
}

const PNG_FILE_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function downloadProfilePng(url: string): Promise<boolean> {
  try {
    const res = await fetch(url + "/profile.png");
    if (res.status !== 200) {
      console.error(`profile.png: HTTP status ${res.status} ${res.statusText} from ${url}`)
      return false;
    }
    const bytes = await res.arrayBuffer();
    let bytearray = new Uint8Array(bytes);
    if (res.headers.get("Content-Type") !== "image/png") {
      console.error(`profile.png: Unexpected Content-Type: ${res.headers.get("Content-Type")} from ${url}`);
      if (!initialBytesMatch(bytearray, PNG_FILE_SIGNATURE)) {
        return false;
      }
      console.warn(`profile.png: File from ${url} stills seems to be a PNG`);
    }
    await Deno.writeFile(`images/${prepDotUrl(url)}.png`, bytearray);
    return true;
  } catch (e) {
    console.error(`profile.png: Error from ${url}:`);
    console.error(e);
    return false;
  }
}

function initialBytesMatch(bytearray: Uint8Array, filesignature: number[]): boolean {
  if (bytearray.length < filesignature.length) {
    return false;
  }
  for (let i = 0; i < filesignature.length; i++) {
    if (bytearray[i] !== filesignature[i]) {
      return false;
    }
  }
  return true;
}

const checkedUrls: string[] = [];
const badUrls: string[] = [];

async function nodeIsGood(url: string): Promise<boolean> {
  if (checkedUrls.includes(url)) {
    return !badUrls.includes(url);
  }
  let healthy = false;
  try {
    const res = await fetch(url + "/health").then(res => res.json());
    if (res.status === "OK") {
      healthy = true;
    } else {
      console.error("health: status was [" + res.status + "] from " + url);
    }
  } catch (e) {
    console.error(`health: Error from ${url}`);
    console.error(e);
  }
  checkedUrls.push(url);
  if (!healthy) {
    badUrls.push(url);
  }
  return healthy;
}

function prepDotUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(".dossiercloud.gq", "")
    .replace(".herokuapp.com", "")
    .replace(".web.app", "")
}

type Edge = [string, string];

export async function main() {
  const knownUrls: string[] = [
    "https://ddd-erik-boot.herokuapp.com"
  ];

  const urlQueue: string[] = knownUrls.map(a => a);
  const edges: Edge[] = [];

  while (true) {
    if (urlQueue.length === 0) break;

    const url = urlQueue.pop()!;
    const nodes = await getNodes(url);
    // console.log("[NODES] " + url + " : " + nodes.join(" , "));
    for (let i = 0; i < nodes.length; i++) {
      let nodeUrl = nodes[i];
      if (!(await nodeIsGood(nodeUrl))) continue;

      edges.push([url, nodeUrl]);
      if (!knownUrls.includes(nodeUrl)) {
        knownUrls.push(nodeUrl)
        urlQueue.push(nodeUrl);
      }
    }
  }

  // console.log(edges);

  console.log("Bad URLs:");
  console.log(badUrls);

  const dotNodes = await Promise.all(
    knownUrls
      .filter(url => !badUrls.includes(url))
      .map(async (url) => ({
        key: prepDotUrl(url),
        url: url,
        hasImage: await downloadProfilePng(url),
      }))
  );

  const dotEdges: Edge[] = edges.map(([a, b]) => [prepDotUrl(a), prepDotUrl(b)]);

  const dotEdgesSet = new Set(dotEdges.map(edge => JSON.stringify(edge)));
  const seenDotEdgesSet = new Set<string>();
  const bidir: Edge[] = [];
  const unidir: Edge[] = [];

  while (true) {
    if (dotEdges.length === 0) {
      break;
    }
    const edge: Edge = dotEdges.pop()!;
    const reverse: Edge = [edge[1], edge[0]];

    let edgeString = JSON.stringify(edge);
    let reverseString = JSON.stringify(reverse);

    // is it bidirectional?
    if (dotEdgesSet.has(edgeString) && dotEdgesSet.has(reverseString)) {
      if (seenDotEdgesSet.has(edgeString) || seenDotEdgesSet.has(reverseString)) {
        continue;
      }
      seenDotEdgesSet.add(edgeString);
      seenDotEdgesSet.add(reverseString);
      bidir.push(edge);
    } else {
      unidir.push(edge);
    }
  }

  const dotfile = `
digraph Network {
    layout=neato;
    overlap=voronoi;
    sep="-3.5";
    outputorder="edgesfirst";
    bgcolor="#ececec"
    splines=true;
    ratio=1;

    node [
        imagescale=true,
        fixedsize=true,
        shape=box,
        style=filled,
        fillcolor=white,
        fontcolor=blue,
        fontsize=11,
        labelloc=b,
        imagepos="tc",
        height="1.05",
        fontname="Helvetica-Bold",
        penwidth="0"
    ]

    edge [
        color="black"
    ]


    ${
    "\n" + dotNodes
      .map(node => `    "${node.key}" [URL="${node.url}"${node.hasImage ? `, image="images/${node.key}.png"` : ""}]`)
      .join("\n")
  }

    ${"\n" + unidir.map(([a, b]) => `    "${a}" -> "${b}"`).join("    \n")}
    ${"\n" + bidir.map(([a, b]) => `    "${a}" -> "${b}" [dir="both", color=darkred]`).join("    \n")}

}
`
  // console.log(dotfile);

  await Deno.writeTextFile("network.dot", dotfile);
}

if (import.meta.main) {
  main();
}
