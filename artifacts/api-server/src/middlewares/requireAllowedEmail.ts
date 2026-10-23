import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

const approvedEmails = () =>
  new Set(
    (process.env.VILLA_PAYROLL_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

export const requireAllowedEmail: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: "Sign-in is required." });
    return;
  }

  const allowlist = approvedEmails();
  if (allowlist.size === 0) {
    res.status(403).json({ error: "This account is not approved." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const hasApprovedVerifiedEmail = user.emailAddresses.some(
      (address) =>
        address.verification?.status === "verified" &&
        allowlist.has(address.emailAddress.trim().toLowerCase()),
    );

    if (!hasApprovedVerifiedEmail) {
      res.status(403).json({ error: "This account is not approved." });
      return;
    }

    next();
  } catch {
    req.log.error("Could not verify the signed-in account.");
    res.status(503).json({ error: "Account access could not be verified." });
  }
};
