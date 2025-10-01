# 💰 다중 대출 상환 시뮬레이터

여러 대출을 효율적으로 관리하고 최적의 상환 전략을 세울 수 있는 시뮬레이터입니다.

## ✨ 주요 기능

### 📊 다중 대출 관리
- 무제한 대출 추가/삭제
- 원리금균등상환, 만기일시상환 방식 지원
- 대출별 조기상환 허용 여부 설정

### 🎯 상환 전략
- **아발란치 전략**: 금리가 높은 대출부터 우선 상환
- **스노우볼 전략**: 잔액이 작은 대출부터 우선 상환
- 타겟 고정 모드: 특정 대출에 추가 예산 집중

### 📈 시각화
- 대출별 잔액 추이 그래프 (Area Chart)
- 월별 납입 분해 그래프 (Stacked Bar Chart)
- 대출별 상세 상환 스케줄 테이블
- 색상으로 구분된 원금/이자 표시

### 💾 데이터 관리
- LocalStorage 자동 저장
- CSV 파일 내보내기 (대출별 상세 정보 포함)
- 한글 지원 (UTF-8 BOM)

## 🚀 시작하기

### 설치

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:3000)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## 🛠️ 기술 스택

- **React 18** - UI 라이브러리
- **Vite** - 빌드 도구
- **Tailwind CSS** - 스타일링
- **Recharts** - 차트 라이브러리
- **Lucide React** - 아이콘
- **UUID** - 고유 ID 생성

## 📦 배포

### Vercel 배포

1. GitHub에 프로젝트 푸시
2. [Vercel](https://vercel.com)에 로그인
3. "New Project" 클릭
4. GitHub 저장소 선택
5. 자동으로 Vite 프로젝트 감지 및 배포

### 기타 플랫폼

- **Netlify**: `npm run build` 후 `dist` 폴더 배포
- **GitHub Pages**: `vite-plugin-gh-pages` 사용
- **Firebase Hosting**: `firebase deploy`

## 📋 사용법

1. **대출 추가**: 이름, 원금, 이자율, 기간, 상환방식 입력
2. **전략 선택**: 아발란치 또는 스노우볼 전략 선택
3. **추가 예산 설정**: 매월 추가로 상환할 금액 입력
4. **시뮬레이션 확인**:
   - 🎯 버튼으로 대출별 상세 스케줄 확인
   - 그래프에서 잔액 추이 및 납입 분해 확인
   - CSV 다운로드로 데이터 백업

## ⚠️ 유의사항

- 고정금리, 원리금균등 상환 가정
- 조기상환 수수료 0원 가정
- 실제 대출 상품은 변동금리, 중도상환수수료 등으로 결과가 달라질 수 있음

## 📄 라이선스

MIT License

## 🤝 기여

이슈와 PR은 언제나 환영합니다!

---

**Made with ❤️ for better financial planning**
