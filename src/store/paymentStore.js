/*
 * paymentStore.js — Payment & Subscription State (Zustand)
 *
 * Purpose:
 *   Manages subscription status, payment history, and the Razorpay checkout flow.
 *   Kept separate from chatStore to avoid coupling unrelated concerns and to allow
 *   this store to be imported only in billing-related components.
 *
 * How the upgrade flow works end-to-end:
 *   1. User clicks "Upgrade to PRO" → openUpgradeModal() shows the UpgradeModal.
 *   2. User clicks "Subscribe" in the modal → initiateCheckout() is called.
 *   3. initiateCheckout() calls paymentApi.createSubscription() to create the
 *      one-time Razorpay order on the backend. The backend returns a razorpayOrderId.
 *   4. initiateCheckout() opens the Razorpay Checkout widget (window.Razorpay)
 *      with the order ID. The user completes payment in the widget.
 *   5. Razorpay sends a webhook to the payment-service backend (async).
 *      The backend upgrades the user's subscriptionTier to PRO.
 *   6. The handler callback calls refreshAuthAfterPayment() which calls the token
 *      refresh endpoint to get an updated JWT that includes the new tier claim.
 *   7. Then fetchSubscription() is called to update the UI to show PRO status.
 *
 * State fields:
 *   subscription    — current subscription object { id, plan, status, razorpayOrderId, ... }
 *                     null until first fetched. 404 from backend → FREE tier default.
 *   payments        — array of past payment records for BillingPage history tab.
 *   loading         — true while any async call is in progress.
 *   error           — error message if the last operation failed.
 *   upgradeModalOpen — controls whether the full-screen upgrade modal is visible.
 *   razorpayReady   — true once the Razorpay checkout.js SDK script has loaded.
 */
import { create } from "zustand";
import { paymentApi } from "../services/paymentApi";
import { api } from "../services/api";
import { useAuthStore } from "./authStore";

export const usePaymentStore = create((set, get) => ({
  subscription: null,
  payments: [],
  loading: false,
  error: null,
  upgradeModalOpen: false,
  razorpayReady: false,

  openUpgradeModal: () => set({ upgradeModalOpen: true }),
  closeUpgradeModal: () => set({ upgradeModalOpen: false }),

  /*
   * setRazorpayReady(ready) — called by the component that loads the Razorpay
   * <script> tag. Once true, initiateCheckout() knows window.Razorpay is available.
   */
  setRazorpayReady: (ready) => set({ razorpayReady: ready }),

  /*
   * fetchSubscription() — fetches the user's current subscription from the backend.
   * If the backend returns 404 it means the user has never subscribed, so we
   * default to showing them as a FREE user. Any other error is surfaced to the UI.
   */
  fetchSubscription: async () => {
    set({ loading: true, error: null });
    try {
      const data = await paymentApi.getSubscriptionStatus();
      set({ subscription: data, loading: false });
    } catch (e) {
      if (e.status === 404) {
        set({
          subscription: { plan: "FREE", status: "ACTIVE" },
          loading: false,
        });
      } else {
        set({ error: e.message, loading: false });
      }
    }
  },

  /*
   * refreshAuthAfterPayment() — silently refreshes the JWT after a successful payment.
   *
   * After Razorpay confirms payment, the backend webhook upgrades the user's
   * subscriptionTier. However, the existing JWT still contains the old tier.
   * This method calls api.refreshSession() to get a fresh JWT that includes the
   * updated tier, then pushes the new token and user object into authStore so
   * the entire app immediately reflects the PRO status.
   */
  refreshAuthAfterPayment: async () => {
    await api.refreshSession();
    const token = localStorage.getItem("accessToken");
    const userStr = localStorage.getItem("user");
    useAuthStore.setState({
      token,
      user: userStr ? JSON.parse(userStr) : null,
    });
  },

  /*
   * fetchPaymentHistory() — loads the full list of past payment transactions.
   * Used by BillingPage to show the billing history tab with dates, amounts, and statuses.
   */
  fetchPaymentHistory: async () => {
    set({ loading: true });
    try {
      const data = await paymentApi.getPaymentHistory();
      set({ payments: data || [], loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  /*
   * initiateCheckout({ razorpayKeyId, userEmail, userName }) — opens the Razorpay payment widget.
   *
   * Steps:
   *   1. Calls paymentApi.createOrder() to create a Razorpay order on the backend
   *      and get back a razorpayOrderId.
   *   2. Creates a new window.Razorpay instance with the order ID and prefills
   *      the user's email and name so they don't have to type them again.
   *   3. Calls rzp.open() to show the Razorpay payment popup to the user.
   *   4. On successful payment (handler callback): calls refreshAuthAfterPayment()
   *      and fetchSubscription() to update the UI to show PRO.
   *   5. On modal dismiss (user closed without paying): rejects the Promise so the
   *      calling component can show a "cancelled" message.
   */
  initiateCheckout: async ({ razorpayKeyId, userEmail, userName }) => {
    if (!window.Razorpay) {
      throw new Error("Razorpay SDK not loaded. Refresh and try again.");
    }
    set({ loading: true, error: null });
    try {
      // Always fetch the key from the backend so test/live mode is driven by
      // server config, not a frontend env var that can easily get out of sync.
      let keyId = razorpayKeyId;
      let amountPaise;
      try {
        const cfg = await paymentApi.getConfig();
        if (cfg?.razorpayKeyId) keyId = cfg.razorpayKeyId;
        if (cfg?.amountPaise) amountPaise = cfg.amountPaise;
      } catch {
        // fall back to the caller-supplied key (env var) if config endpoint fails
      }

      const sub = await paymentApi.createOrder();
      const razorpayOrderId = sub.razorpayOrderId;
      const normalizedAmount = Number(amountPaise);
      const validAmount =
        Number.isInteger(normalizedAmount) && normalizedAmount >= 100
          ? normalizedAmount
          : 9900;

      return new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: keyId,
          order_id: razorpayOrderId,
          amount: validAmount,
          currency: "INR",
          name: "ConnectHub",
          description: "ConnectHub PRO one-time upgrade",
          image: "/logo.png",
          prefill: {
            email: userEmail || "",
            name: userName || "",
          },
          theme: { color: "#7C3AED" },
          handler: async function (response) {
            set({ loading: false });
            try {
              await get().refreshAuthAfterPayment();
            } catch {
              /* webhook may lag; user can refresh page */
            }
            await get().fetchSubscription();
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              set({ loading: false });
              reject(new Error("Payment cancelled"));
            },
          },
        });
        rzp.open();
      });
    } catch (e) {
      set({ loading: false, error: e.message });
      throw e;
    }
  },

  /*
   * isPro() — returns true if the user has an active paid subscription.
   * Checks that the plan is not FREE and the status is not CANCELLED or EXPIRED.
   * Used by components to decide whether to show upgrade prompts or unlock features.
   */
  isPro: () => {
    const role = (useAuthStore.getState().user?.role || "").toUpperCase();
    if (role === "ADMIN" || role === "PLATFORM_ADMIN") return true;
    const { subscription } = get();
    if (!subscription) return false;
    const status = (subscription.status || "").toUpperCase();
    // PENDING means order created but payment not yet confirmed
    if (["CANCELLED", "EXPIRED", "PENDING"].includes(status)) return false;
    // Client-side guard: treat as expired if endDate has passed
    if (subscription.endDate && new Date(subscription.endDate) < new Date()) return false;
    return subscription.plan !== "FREE";
  },
}));
