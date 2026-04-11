import { useEffect } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { PageLoading } from "@/components/PageLoading";

/** /ref/CODE → signup with referral pre-filled */
export default function RefRedirectPage() {
  const params = useParams();
  const search = useSearch();
  const [, navigate] = useLocation();
  const code = (params as { code?: string }).code;

  useEffect(() => {
    const sc = new URLSearchParams(search).get("sc");
    if (code) {
      const q = new URLSearchParams();
      q.set("ref", code);
      if (sc) q.set("sc", sc);
      navigate(`/signup?${q.toString()}`);
    } else navigate("/signup");
  }, [code, search, navigate]);

  return <PageLoading />;
}
