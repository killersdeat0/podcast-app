import Sidebar from '@/components/ui/Sidebar'
import Player from '@/components/player/Player'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-28">{children}</main>
      <Player />
    </div>
  )
}
