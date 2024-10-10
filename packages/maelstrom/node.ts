import readLine from "node:readline";
import { z } from "zod";

const requestSchema = z.object({
  src: z.string(),
  dest: z.string(),
  body: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("init"),
      msg_id: z.string(),
      node_id: z.string(),
      node_ids: z.array(z.string()),
      in_reply_to: z.string().optional(),
    }),
    z.object({
      type: z.string(),
      msg_id: z.string(),
      in_reply_to: z.string().optional(),
      echo: z.string().optional(),
      node_id: z.string().optional(),
      node_ids: z.array(z.string()).optional(),
    }),
  ]),
});

export type Request = z.infer<typeof requestSchema>;

type HandlerFunction = (request: Request) => void;

const handlers: Record<string, HandlerFunction> = {};

const replyHandlers: Record<
  string,
  {
    resolve: (value: Request) => void;
    reject: (reason?: Request) => void;
  }
> = {};

export let nodeId = "";

const rl = readLine.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

export function main() {
  rl.on("line", (line) => {
    console.log(line);
    // Parse request string to JSON
    let jsonRequest: unknown;
    try {
      jsonRequest = JSON.parse(line);
    } catch (err) {
      console.error(err);
      return;
    }

    // Parse JSON to request object
    const parsed = requestSchema.safeParse(jsonRequest);

    if (!parsed.success) {
      console.error(parsed.error);
      return;
    }
    handle(parsed.data);
  });
}

/**
 * Handle a request
 * @param request - The request to handle
 */
function handle(request: Request) {
  const {
    body: { type },
    body,
  } = request;

  if (body.in_reply_to) {
    // Handle replies
    const handler = replyHandlers[body.in_reply_to];
    if (handler) {
      if (body.type === "error") handler.reject(request);
      else handler.resolve(request);
    }
    return;
  }

  if (type === "init") {
    // Init is a special case with its own handler
    handleInit(request);
    return;
  }

  if (type in handlers) {
    handlers[type]?.(request);
  }
}

/**
 * Check if the body is an init body to use the proper type discriminant
 * @param body - The body to check
 * @returns - Whether the body is an init body
 */
function isInitBody(
  body: Request["body"]
): body is Extract<Request["body"], { type: "init" }> {
  return body.type === "init";
}

/**
 * Handle an init request
 * It sets up the initial fields for the node, such as node id and the list of available node ids
 * @param request - The init request
 */
function handleInit(request: Request) {
  if (!isInitBody(request.body)) {
    console.error("Invalid request type for handleInit");
    return;
  }

  nodeId = request.body.node_id;
  reply(request, { type: "init_ok" });
}

/**
 * Reply to a request
 * @param request - The request to reply to
 * @param body - The body of the reply
 */
function reply(request: Request, body: Partial<Request["body"]>) {
  const response = {
    src: nodeId,
    dest: request.src,
    body: {
      ...body,
      in_reply_to: request.body.msg_id,
    },
  };

  console.log(JSON.stringify(response));
}
