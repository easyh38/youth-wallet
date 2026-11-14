"use client";

import { ChevronLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { PolicyDetail } from "@/components/policy-detail";

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const policyId = decodeURIComponent(id);

  return (
    <div className="mx-auto max-w-[680px] py-2">
      <button
        type="button"
        onClick={() => (history.length > 1 ? router.back() : router.push("/policies"))}
        className="ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[15px] font-medium hover:bg-line-soft"
      >
        <ChevronLeft size={18} aria-hidden /> 목록
      </button>
      <PolicyDetail key={policyId} id={policyId} />
    </div>
  );
}
