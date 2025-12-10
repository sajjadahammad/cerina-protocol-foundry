import { CreateProtocolForm } from "@/components/create-protocol-form"
import { ProtectedRoute } from "@/components/protected-route"

export default function NewProtocolPage() {
  return (
    <ProtectedRoute>
      <CreateProtocolForm />
    </ProtectedRoute>
  )
}
