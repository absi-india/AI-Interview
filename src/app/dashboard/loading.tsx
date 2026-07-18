export default function Loading() {
  return (
    <div className="min-h-screen flex" style={{ background: "#e9edf3" }}>
      <aside className="hidden lg:block w-60 flex-none bg-[#0f172a] border-r border-[#1e293b]" />
      <div className="flex-1 min-w-0">
        <div className="h-[62px] bg-white border-b border-[#e1e7f0] flex items-center px-6">
          <div className="skel h-10 w-full max-w-[440px]" />
        </div>
        <div className="p-6 lg:p-7 space-y-6">
          <div className="space-y-2">
            <div className="skel h-8 w-52" />
            <div className="skel h-4 w-72" />
          </div>
          <div className="grid gap-[18px] lg:grid-cols-[2fr_1fr]">
            <div className="skel h-[280px] rounded-2xl" />
            <div className="flex flex-col gap-[18px]">
              <div className="skel h-[130px] rounded-2xl" />
              <div className="skel h-[130px] rounded-2xl" />
            </div>
          </div>
          <div className="skel h-[320px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
