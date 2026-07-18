// Trục PHÒNG BAN (department) — tách định tuyến khỏi app_role. Xem plans/260719-department-routing.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { ordersDb } from "@/lib/orders";

export interface Department {
  id: string;
  code: string; // reception|treatment|imaging|lab|pharmacy
  name_vi: string;
  name: string;
  sort_order: number;
  active: boolean;
}

// Map order_type → department code (hiển thị/fallback; nguồn thật là route_order trigger + kb_rules).
export const ORDER_TYPE_DEPARTMENT_CODE: Record<string, string> = {
  imaging: "imaging",
  lab: "lab",
  procedure: "treatment",
  medication: "pharmacy",
  consent: "reception",
  follow_up: "reception",
  referral: "reception",
};

/** Các phòng caller đang trực (admin thấy hết). Dùng cho hàng đợi + nav. */
export function useMyDepartments() {
  const { user } = useAuth();
  return useQuery<Department[]>({
    queryKey: ["my-departments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_my_departments");
      if (error) throw error;
      return (data as Department[]) ?? [];
    },
  });
}
