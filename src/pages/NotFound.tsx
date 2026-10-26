import { useNavigate } from 'react-router-dom'
import { StepFlow } from '../components/StepFlow'
import { TopBar } from '../components/ui'

export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="page vpage">
      <TopBar title="찾을 수 없음" />
      <StepFlow stepKey="404" icon="zoom" eyebrow="404" title="없는 화면이에요" subtitle="주소를 다시 확인해 주세요." onNext={() => navigate('/')} nextLabel="홈으로" />
    </div>
  )
}
