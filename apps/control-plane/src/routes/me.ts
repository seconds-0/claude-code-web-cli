import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";

type Variables = {
  userId: string;
};

export const meRoute = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes in this module
meRoute.use("*", authMiddleware);

meRoute.get("/", (c) => {
  const userId = c.get("userId");
  return c.json({ userId });
});
