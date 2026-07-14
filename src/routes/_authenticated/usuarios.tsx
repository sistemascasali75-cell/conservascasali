import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, type AppRole } from "@/hooks/use-role";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ShieldCheck, Users, Search, UserCog, Crown, ClipboardList, Eye, Beaker } from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
});

type UserRow = {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  roles: AppRole[];
};

const ALL_ROLES: { value: AppRole; label: string; desc: string; icon: any; tone: string }[] = [
  { value: "ADMIN", label: "Administrador", desc: "Acceso total al sistema", icon: Crown, tone: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "OPERADOR", label: "Operador", desc: "Operaciones diarias del almacén", icon: ClipboardList, tone: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "INSUMOS", label: "Insumos", desc: "Control total del módulo Insumos · resto solo lectura", icon: Beaker, tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "VISITA", label: "Visita", desc: "Solo lectura · todas las vistas", icon: Eye, tone: "bg-violet-100 text-violet-800 border-violet-200" },
];

function roleMeta(r: AppRole) {
  return ALL_ROLES.find((x) => x.value === r)!;
}

function UsuariosPage() {
  const { isAdmin, isLoading } = useRoles();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [pickedRoles, setPickedRoles] = useState<AppRole[]>([]);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate({ to: "/" });
  }, [isLoading, isAdmin, navigate]);

  const { data: users = [], isFetching } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
    enabled: isAdmin,
  });

  const setRolesMut = useMutation({
    mutationFn: async ({ user, roles }: { user: string; roles: AppRole[] }) => {
      const { error } = await supabase.rpc("admin_set_user_roles", { p_user: user, p_roles: roles });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Roles actualizados");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email?.toLowerCase().includes(q) || u.roles.join(",").toLowerCase().includes(q));
  }, [users, search]);

  const stats = useMemo(() => {
    const total = users.length;
    const sinRol = users.filter((u) => u.roles.length === 0).length;
    const admins = users.filter((u) => u.roles.includes("ADMIN")).length;
    const supers = users.filter((u) => u.roles.includes("OPERADOR")).length;
    return { total, sinRol, admins, supers };
  }, [users]);

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setPickedRoles(u.roles.length ? u.roles : ["VISITA"]);
  };

  const toggleRole = (r: AppRole) => {
    setPickedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="size-7" /> Control de usuarios
          </h1>
          <p className="text-muted-foreground mt-1">Asigna y gestiona los roles del personal del sistema.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Usuarios" value={stats.total} icon={Users} tone="text-foreground" />
        <StatCard label="Sin rol asignado" value={stats.sinRol} icon={UserCog} tone="text-rose-600" />
        <StatCard label="Administradores" value={stats.admins} icon={Crown} tone="text-amber-600" />
        <StatCard label="Operadores" value={stats.supers} icon={ShieldCheck} tone="text-blue-600" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle>Personal registrado</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por correo o rol" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Correo</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden md:table-cell">Registrado</TableHead>
                  <TableHead className="hidden md:table-cell">Último ingreso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFetching && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
                )}
                {!isFetching && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin resultados</TableCell></TableRow>
                )}
                {filtered.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <div className="font-medium">{u.email}</div>
                      {u.user_id === meId && <div className="text-[11px] text-muted-foreground">(tú)</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">Sin rol</Badge>
                        ) : (
                          u.roles.map((r) => {
                            const m = roleMeta(r);
                            return <Badge key={r} variant="outline" className={m.tone}>{m.label}</Badge>;
                          })
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("es-PE")}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("es-PE") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                        <UserCog className="size-4 mr-1" /> Asignar roles
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="py-4 text-sm text-muted-foreground">
          <strong className="text-foreground">¿Cómo se agregan usuarios?</strong> Pide al nuevo usuario que ingrese al sistema con su cuenta Google.
          Aparecerá automáticamente en esta lista y podrás asignarle el rol correspondiente.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> Claves de acceso por rol</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tras iniciar sesión con Google, cada usuario elige un rol e ingresa la clave correspondiente.
            La clave <strong className="text-foreground">VISITA</strong> permite recorrer todo el sistema en modo solo lectura,
            sin posibilidad de crear, editar o eliminar registros.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-amber-50 border-amber-200 p-3">
              <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold">Administrador</div>
              <div className="mt-1 font-mono text-lg font-bold text-amber-900">2026</div>
              <div className="text-xs text-amber-800 mt-1">Control total del sistema</div>
            </div>
            <div className="rounded-lg border bg-blue-50 border-blue-200 p-3">
              <div className="text-xs uppercase tracking-wider text-blue-700 font-semibold">Operador</div>
              <div className="mt-1 font-mono text-lg font-bold text-blue-900">o2026</div>
              <div className="text-xs text-blue-800 mt-1">Operaciones diarias del almacén</div>
            </div>
            <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3">
              <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Insumos</div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-900">i2026</div>
              <div className="text-xs text-emerald-800 mt-1">Control total del módulo Insumos · resto solo lectura</div>
            </div>
            <div className="rounded-lg border bg-violet-50 border-violet-200 p-3">
              <div className="text-xs uppercase tracking-wider text-violet-700 font-semibold">Visita</div>
              <div className="mt-1 font-mono text-lg font-bold text-violet-900">v2026</div>
              <div className="text-xs text-violet-800 mt-1">Solo lectura · todas las vistas</div>
            </div>
          </div>
        </CardContent>
      </Card>


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar roles</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ALL_ROLES.map((r) => {
              const checked = pickedRoles.includes(r.value);
              const Icon = r.icon;
              return (
                <label
                  key={r.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleRole(r.value)} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Icon className="size-4" /> {r.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                  </div>
                  <Badge variant="outline" className={r.tone}>{r.value}</Badge>
                </label>
              );
            })}
            {editing?.user_id === meId && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                No puedes quitarte tu propio rol ADMIN para evitar bloquearte fuera del sistema.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              onClick={() => editing && setRolesMut.mutate({ user: editing.user_id, roles: pickedRoles })}
              disabled={setRolesMut.isPending}
            >
              {setRolesMut.isPending ? "Guardando…" : "Guardar roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-3">
        <div className={`p-2 rounded-md bg-muted ${tone}`}><Icon className="size-5" /></div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
