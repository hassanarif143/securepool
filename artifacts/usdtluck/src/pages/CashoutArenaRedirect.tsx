import { useEffect } from "react";
import { useLocation } from "wouter";

/** Cashout Arena removed — forward to the new games hub. */
export default function CashoutArenaRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/games/spin-wheel", { replace: true });
  }, [navigate]);
  return null;
}
