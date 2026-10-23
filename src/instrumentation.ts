/**
 * Runs once when the server starts. Checks hourly whether this month's fee
 * challans are due (Settings → auto monthly fees) and raises them once.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { feeBillingService } = await import("@/backend/services/feeBilling.service");
  const check = () =>
    feeBillingService.runAutoIfDue().catch((e: Error) => {
      console.error("[fees] automatic billing check failed:", e.message);
    });
  setTimeout(check, 15_000);
  setInterval(check, 60 * 60 * 1000).unref?.();
}
