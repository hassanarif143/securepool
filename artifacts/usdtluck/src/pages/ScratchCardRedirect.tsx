import { useEffect } from "react";
import { useLocation } from "wouter";

/** Legacy scratch flow replaced by Mini Games scratch card. */
export default function ScratchCardRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/games?tab=scratch", { replace: true });
  }, [navigate]);
  return null;
}
