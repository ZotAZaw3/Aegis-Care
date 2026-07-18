// Hook lấy staff.id của user đang đăng nhập (khác auth user.id). Dùng chung các workspace.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { currentStaffId } from "@/lib/orders";

export function useStaffId(): string | undefined {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["current-staff", user?.id],
    enabled: !!user,
    queryFn: () => (user ? currentStaffId(user.id) : Promise.resolve(undefined)),
  }).data;
}
