export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#e9e7ff_0,transparent_35%),radial-gradient(circle_at_bottom_right,#dff7f4_0,transparent_35%),#f5f6f9] px-5 py-12">
      {children}
    </main>
  );
}
