import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { 
  BarChart3, FileText, Download, Lock, CheckCircle, Search, Edit3, Save, MessageSquare, AlertCircle, RefreshCw, X
} from 'lucide-react';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'hr-edu-app-default';

const COLLECTION_NAME = 'submissions';
const INTRO_COLLECTION = 'intro_opinions';
const TEACHER_PASSWORD = 'password123'; // 데모용 교사 비밀번호

// 모의 인권 지수 데이터 (0~100으로 정규화, 100이 가장 인권이 보장된 상태로 가정)
const COUNTRY_DATA = {
  "한국": { 언론자유: 70, 기아: 95, 성평등: 65, 노동권: 60, 평화: 75 },
  "미국": { 언론자유: 75, 기아: 90, 성평등: 75, 노동권: 50, 평화: 60 },
  "스웨덴": { 언론자유: 95, 기아: 98, 성평등: 95, 노동권: 90, 평화: 90 },
  "중국": { 언론자유: 20, 기아: 80, 성평등: 60, 노동권: 40, 평화: 55 },
  "소말리아": { 언론자유: 30, 기아: 20, 성평등: 30, 노동권: 25, 평화: 10 },
  "인도": { 언론자유: 40, 기아: 60, 성평등: 50, 노동권: 45, 평화: 40 },
  "독일": { 언론자유: 85, 기아: 95, 성평등: 85, 노동권: 85, 평화: 80 },
  "아프가니스탄": { 언론자유: 15, 기아: 10, 성평등: 10, 노동권: 15, 평화: 5 }
};

const COUNTRIES = Object.keys(COUNTRY_DATA);
const INDICATORS = ['언론자유', '기아', '성평등', '노동권', '평화'];

const generateGeminiFeedback = async (studentData) => {
  const apiKey = ""; // Canvas environment will inject this
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
  
  const systemPrompt = `당신은 고등학교 1학년 통합사회 교사입니다. 학생이 제출한 '세계 인권지수 분석 및 공익 광고 기획' 과제를 평가하고 피드백을 작성해야 합니다.
성취기준: [10통사2-01-03] 사회적 소수자 차별 등 국내 인권 문제와 인권지수를 통해 확인할 수 있는 세계 인권 문제의 양상을 조사하고, 이에 대한 해결 방안을 모색한다.

평가 기준 (다음 수준을 참고하여 학생의 현재 수준에 맞게 격려와 발전 방향을 제시하세요):
- 심화: 여러 지수 간 관계를 근거로 구조적 원인을 논리적으로 설명하고, 해결 방안(사회적/개인적 차원)을 모두 반영함.
- 기본: 두 가지 이상의 지수를 비교하여 국가 간 차이를 설명하고 해결 방안을 광고에 담음.
- 기초: 하나의 지수에서 순위 차이를 확인하고 광고의 기본 형식을 갖춤.

학생 과제 데이터:
- 선택한 국가: ${studentData.countries.join(', ')}
- 데이터 분석 노트: ${studentData.analysis}
- 공익 광고 기획: ${studentData.psa}
- 세계시민 다짐: ${studentData.pledge}

지시사항:
1. 학생의 노력을 칭찬하고 분석 내용을 구체적으로 언급하세요.
2. 성취기준과 평가기준에 비추어 잘한 점과 보완할 점을 3~4문장으로 작성하세요.
3. 교사가 검토 후 바로 학생에게 전달할 수 있도록 학생에게 직접 말하는 친절한 말투(~해요, ~군요, ~해볼까요?)를 사용하세요.
4. 마크다운 기호 없이 순수 텍스트로만 출력하세요.`;

  const payload = {
    contents: [{ parts: [{ text: "학생의 과제를 바탕으로 피드백 초안을 작성해주세요." }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (result.candidates && result.candidates.length > 0) {
      return result.candidates[0].content.parts[0].text;
    } else {
      throw new Error("AI 응답을 생성하지 못했습니다.");
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "AI 피드백 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }
};

const downloadCSV = (data) => {
  if (!data || data.length === 0) return;
  
  const headers = ['이름', '학번', '선택국가1', '선택국가2', '선택국가3', '데이터분석', '공익광고기획', '세계시민다짐', '교사피드백', '제출일시'];
  const csvRows = [headers.join(',')];
  
  data.forEach(row => {
    const values = [
      row.studentName || '',
      row.studentId || '',
      row.countries?.[0] || '',
      row.countries?.[1] || '',
      row.countries?.[2] || '',
      `"${(row.analysis || '').replace(/"/g, '""')}"`,
      `"${(row.psa || '').replace(/"/g, '""')}"`,
      `"${(row.pledge || '').replace(/"/g, '""')}"`,
      `"${(row.teacherFeedback || '').replace(/"/g, '""')}"`,
      row.createdAt ? new Date(row.createdAt).toLocaleString() : ''
    ];
    csvRows.push(values.join(','));
  });
  
  const csvString = csvRows.join('\n');
  const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' }); // \uFEFF for Excel UTF-8 BOM
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `인권지수_수업결과_${new Date().getTime()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="text-xl font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function HumanRightsApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('student'); // 'student', 'teacher_login', 'teacher_dashboard'
  
  // App wide state
  const [submissions, setSubmissions] = useState([]);
  const [introOpinions, setIntroOpinions] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Authentication Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsInitializing(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch Submissions and Intro Opinions
  useEffect(() => {
    if (!user) return;
    
    const submissionsRef = collection(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME);
    const unsubscribeSub = onSnapshot(submissionsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by date descending in memory
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSubmissions(data);
    }, (error) => {
      console.error("Error fetching submissions:", error);
    });

    const introRef = collection(db, 'artifacts', appId, 'public', 'data', INTRO_COLLECTION);
    const unsubscribeIntro = onSnapshot(introRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setIntroOpinions(data);
    }, (error) => {
      console.error("Error fetching intro opinions:", error);
    });
    
    return () => {
      unsubscribeSub();
      unsubscribeIntro();
    };
  }, [user]);

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-blue-500" size={32} /></div>;
  }

  const renderTeacherLogin = () => {
    const [pwd, setPwd] = useState('');
    const [error, setError] = useState(false);

    const handleLogin = (e) => {
      e.preventDefault();
      if (pwd === TEACHER_PASSWORD) {
        setView('teacher_dashboard');
      } else {
        setError(true);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-amber-100 p-4 rounded-full text-amber-600">
              <Lock size={40} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">교사 인증</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
              <input 
                type="password" 
                value={pwd}
                onChange={(e) => { setPwd(e.target.value); setError(false); }}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                placeholder="비밀번호를 입력하세요"
              />
              {error && <p className="text-red-500 text-sm mt-1">비밀번호가 일치하지 않습니다.</p>}
            </div>
            <button type="submit" className="w-full bg-amber-600 text-white py-3 rounded-lg font-bold hover:bg-amber-700 transition-colors">
              대시보드 입장
            </button>
            <button type="button" onClick={() => setView('student')} className="w-full bg-slate-100 text-slate-600 py-3 rounded-lg font-medium hover:bg-slate-200 transition-colors mt-2">
              학생 화면으로 돌아가기
            </button>
          </form>
        </div>
      </div>
    );
  };

  const StudentView = () => {
    // Student Form States
    const [step, setStep] = useState(0); // 0 is Intro
    const [studentName, setStudentName] = useState('');
    const [studentId, setStudentId] = useState('');
    const [introOpinion, setIntroOpinion] = useState('');
    const [isSubmittingOpinion, setIsSubmittingOpinion] = useState(false);
    const [selectedCountries, setSelectedCountries] = useState([]);
    const [analysis, setAnalysis] = useState('');
    const [psa, setPsa] = useState('');
    const [pledge, setPledge] = useState('');
    
    // Status
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittedData, setSubmittedData] = useState(null);

    // Check if current user already submitted
    useEffect(() => {
      if (user && submissions.length > 0) {
        const mySubmission = submissions.find(sub => sub.uid === user.uid);
        if (mySubmission) {
          setSubmittedData(mySubmission);
        }
      }
    }, [user, submissions]);

    const handleOpinionSubmit = async () => {
      if (!studentName || !studentId || !introOpinion.trim()) return;
      setIsSubmittingOpinion(true);
      try {
        const docRef = collection(db, 'artifacts', appId, 'public', 'data', INTRO_COLLECTION);
        await addDoc(docRef, {
          uid: user.uid,
          studentName,
          studentId,
          opinion: introOpinion,
          createdAt: Date.now()
        });
        setIntroOpinion('');
      } catch (error) {
        console.error("Error submitting opinion:", error);
      } finally {
        setIsSubmittingOpinion(false);
      }
    };

    const handleCountrySelect = (country) => {
      if (selectedCountries.includes(country)) {
        setSelectedCountries(selectedCountries.filter(c => c !== country));
      } else if (selectedCountries.length < 3) {
        setSelectedCountries([...selectedCountries, country]);
      }
    };

    const getChartData = () => {
      return INDICATORS.map(indicator => {
        const dataPoint = { subject: indicator, fullMark: 100 };
        selectedCountries.forEach(country => {
          dataPoint[country] = COUNTRY_DATA[country][indicator];
        });
        return dataPoint;
      });
    };

    const handleSubmit = async () => {
      if (!studentName || !studentId || selectedCountries.length === 0 || !analysis || !psa || !pledge) {
        return; // Basic validation
      }
      setIsSubmitting(true);
      
      const submissionData = {
        uid: user.uid,
        studentName,
        studentId,
        countries: selectedCountries,
        analysis,
        psa,
        pledge,
        createdAt: Date.now(),
        teacherFeedback: null,
        status: 'submitted'
      };

      try {
        const docRef = collection(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME);
        await addDoc(docRef, submissionData);
        // setSubmittedData will be handled by onSnapshot effect
      } catch (error) {
        console.error("Error submitting data: ", error);
      } finally {
        setIsSubmitting(false);
      }
    };

    const renderChart = () => {
      const data = getChartData();
      const colors = ['#8884d8', '#82ca9d', '#ffc658'];
      
      return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col items-center">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 className="text-blue-500" /> 선택 국가 인권지수 비교 (방사형)
          </h3>
          <p className="text-sm text-slate-500 mb-4 text-center">* 점수가 높을수록 인권이 잘 보장됨을 의미합니다 (0~100 환산치)</p>
          
          <div className="w-full h-80 max-w-lg">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                {selectedCountries.map((country, index) => (
                  <Radar 
                    key={country}
                    name={country}
                    dataKey={country}
                    stroke={colors[index]}
                    fill={colors[index]}
                    fillOpacity={0.5}
                  />
                ))}
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    };

    if (submittedData) {
      return (
        <div className="min-h-screen bg-slate-50 py-8 px-4">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
              <h2 className="text-xl font-bold text-slate-800">나의 제출 결과</h2>
              <button onClick={() => setView('teacher_login')} className="text-slate-400 text-sm hover:text-amber-600 flex items-center gap-1 transition-colors">
                <Lock size={14}/> 교사
              </button>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-md border-t-4 border-green-500 text-center">
              <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
              <h3 className="text-2xl font-bold text-slate-800 mb-2">제출이 완료되었습니다!</h3>
              <p className="text-slate-600 mb-6">작성한 과제가 성공적으로 전송되었습니다.</p>
              
              <div className="bg-slate-50 rounded-xl p-6 text-left border border-slate-100">
                <h4 className="font-bold text-slate-700 border-b pb-2 mb-4 flex items-center gap-2">
                  <MessageSquare className="text-blue-500" /> 선생님의 피드백
                </h4>
                {submittedData.teacherFeedback ? (
                  <div className="bg-blue-50 p-4 rounded-lg text-blue-900 leading-relaxed whitespace-pre-wrap">
                    {submittedData.teacherFeedback}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <RefreshCw className="animate-spin mb-2" size={24} />
                    <p>선생님께서 피드백을 작성 중입니다...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 py-4 px-4 sm:py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="text-blue-600" /> [통합사회] 세계 인권지수 탐구
            </h2>
            <button onClick={() => setView('teacher_login')} className="text-slate-400 text-sm hover:text-amber-600 font-medium flex items-center gap-1 transition-colors">
              <Lock size={14} /> 교사 모드
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Progress Bar */}
            {step > 0 && (
              <div className="flex border-b bg-slate-50 overflow-x-auto">
                {[1, 2, 3].map(num => (
                  <div key={num} className={`flex-1 py-4 px-2 text-center font-bold text-sm min-w-[100px] transition-colors ${step === num ? 'bg-blue-600 text-white' : step > num ? 'text-blue-600' : 'text-slate-400'}`}>
                    {num}. {num === 1 ? '국가선택' : num === 2 ? '데이터 분석' : '광고 기획 & 다짐'}
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 sm:p-8">
              {/* STEP 0: 도입 및 의견 공유 */}
              {step === 0 && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-xl">
                    <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm shadow-sm">도입</span> 
                      세계 인권 지도로 문제 인식하기
                    </h3>
                    <div className="space-y-4 text-slate-700 text-sm leading-relaxed">
                      <div><span className="font-bold text-slate-900 block mb-1">📖 성취기준</span>[10통사2-01-03] 사회적 소수자 차별 등 국내 인권 문제와 인권지수를 통해 확인할 수 있는 세계 인권 문제의 양상을 조사하고, 이에 대한 해결 방안을 모색한다.</div>
                      <div><span className="font-bold text-slate-900 block mb-1">🤔 탐구 질문</span>세계 여러 나라의 인권지수는 어떤 차이를 보이며, 이러한 격차를 줄이기 위해 국제 사회는 어떻게 협력해야 할까?</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">학번</label>
                      <input type="text" value={studentId} onChange={e => setStudentId(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" placeholder="예: 10101" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">이름</label>
                      <input type="text" value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" placeholder="홍길동" />
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Search size={18} className="text-blue-500"/> 의문의 세계 지도 탐색</h4>
                    <p className="text-sm text-slate-600 mb-4">아래 지도의 색깔 차이는 무엇을 나타내고 있을까요? 국가별로 색이 다르게 칠해진 이유와 이 지도가 의미하는 바를 유추하여 친구들과 의견을 나눠봅시다.</p>
                    
                    <div className="rounded-lg overflow-hidden border border-slate-200 mb-4 bg-slate-100 flex justify-center items-center p-2">
                      <img 
                        src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Press_freedom_2023.svg/1024px-Press_freedom_2023.svg.png" 
                        alt="의문의 세계 지도" 
                        className="max-w-full h-auto rounded"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="text" 
                        value={introOpinion} 
                        onChange={e => setIntroOpinion(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleOpinionSubmit()}
                        placeholder="이 지도는 어떤 것을 나타내는 지도일까요? 유추한 내용을 적어주세요." 
                        disabled={!studentName || !studentId}
                        className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" 
                      />
                      <button 
                        onClick={handleOpinionSubmit}
                        disabled={!introOpinion.trim() || !studentName || !studentId || isSubmittingOpinion}
                        className="bg-blue-600 text-white px-6 py-3 sm:py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap transition-colors flex justify-center items-center gap-1"
                      >
                        {isSubmittingOpinion ? <RefreshCw size={16} className="animate-spin"/> : <MessageSquare size={16} />} 등록
                      </button>
                    </div>
                  </div>

                  {/* 의견 공유 게시판 */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><MessageSquare size={16} className="text-amber-500"/> 친구들의 의견 ({introOpinions.length})</h4>
                    <div className="h-48 overflow-y-auto space-y-2 pr-2">
                      {introOpinions.length === 0 ? (
                        <p className="text-center text-slate-400 py-8 text-sm">아직 등록된 의견이 없습니다. 학번과 이름을 입력하고 첫 번째로 의견을 남겨보세요!</p>
                      ) : (
                        introOpinions.map(op => (
                          <div key={op.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">{op.studentId} {op.studentName}</span>
                              <span>{new Date(op.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <p className="text-slate-800 text-sm">{op.opinion}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex justify-center pt-4">
                    <button 
                      onClick={() => setStep(1)}
                      disabled={!studentName || !studentId}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-300 transition-colors shadow-md hover:shadow-lg"
                    >
                      본 학습 시작하기 (국가 선택)
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1 */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      비교 분석할 국가를 선택하세요 (최대 3개)
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {COUNTRIES.map(country => {
                        const isSelected = selectedCountries.includes(country);
                        return (
                          <button
                            key={country}
                            onClick={() => handleCountrySelect(country)}
                            className={`px-4 py-2 rounded-full font-medium transition-all ${
                              isSelected 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : selectedCountries.length >= 3
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                            disabled={!isSelected && selectedCountries.length >= 3}
                          >
                            {country}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-sm text-slate-500 mt-2">선택된 국가: {selectedCountries.length}/3</p>
                  </div>

                  <div className="flex justify-between pt-4">
                    <button onClick={() => setStep(0)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors">
                      도입으로 돌아가기
                    </button>
                    <button 
                      onClick={() => setStep(2)}
                      disabled={selectedCountries.length < 2}
                      className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
                    >
                      다음 단계로
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  {renderChart()}
                  
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                      <Search size={18} /> 모둠 데이터 분석 노트
                    </h3>
                    <p className="text-sm text-blue-700 mb-3">
                      위 그래프를 바탕으로 국가 간 인권지수 차이를 비교하고, 지수 간의 상관관계(예: 기아지수와 평화지수)를 탐색하여 인권 문제의 원인을 적어보세요.
                    </p>
                    <textarea 
                      value={analysis}
                      onChange={e => setAnalysis(e.target.value)}
                      className="w-full p-4 border border-blue-200 rounded-lg min-h-[150px] focus:ring-2 focus:ring-blue-500"
                      placeholder="분석 내용을 자유롭게 서술하세요..."
                    />
                  </div>

                  <div className="flex justify-between pt-4">
                    <button onClick={() => setStep(1)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors">
                      이전
                    </button>
                    <button 
                      onClick={() => setStep(3)}
                      disabled={!analysis}
                      className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
                    >
                      다음 단계로
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3 */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="bg-amber-50 p-6 rounded-xl border border-amber-100">
                    <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
                      <Edit3 size={18} /> 인권 문제 해결 공익 광고 기획
                    </h3>
                    <p className="text-sm text-amber-700 mb-3">
                      분석한 데이터를 바탕으로 사회적(국제기구 등) 및 개인적(세계시민의식) 차원의 해결방안을 담은 공익 광고 문구와 구성을 기획해보세요.
                    </p>
                    <textarea 
                      value={psa}
                      onChange={e => setPsa(e.target.value)}
                      className="w-full p-4 border border-amber-200 rounded-lg min-h-[120px] focus:ring-2 focus:ring-amber-500"
                      placeholder="공익 광고 기획안 작성 (캔바 등 외부 도구에서 제작 후 문구/설명 요약)"
                    />
                  </div>

                  <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100">
                    <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
                      <Save size={18} /> 세계시민으로서의 다짐
                    </h3>
                    <p className="text-sm text-emerald-700 mb-3">
                      인권 문제 해결을 위해 실천할 수 있는 다짐을 한 줄로 적어주세요.
                    </p>
                    <input 
                      type="text"
                      value={pledge}
                      onChange={e => setPledge(e.target.value)}
                      className="w-full p-4 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      placeholder="나의 실천 다짐 한 줄 쓰기..."
                    />
                  </div>

                  <div className="flex justify-between pt-6 border-t">
                    <button onClick={() => setStep(2)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors">
                      이전
                    </button>
                    <button 
                      onClick={handleSubmit}
                      disabled={!psa || !pledge || isSubmitting}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-300 transition-colors flex items-center gap-2"
                    >
                      {isSubmitting ? <RefreshCw className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                      최종 제출하기
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TeacherDashboard = () => {
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Feedback States
    const [feedbackText, setFeedbackText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const openFeedbackModal = (student) => {
      setSelectedStudent(student);
      setFeedbackText(student.teacherFeedback || '');
      setIsModalOpen(true);
    };

    const handleGenerateAI = async () => {
      if (!selectedStudent) return;
      setIsGenerating(true);
      const generatedFeedback = await generateGeminiFeedback(selectedStudent);
      setFeedbackText(generatedFeedback);
      setIsGenerating(false);
    };

    const handleSaveFeedback = async () => {
      if (!selectedStudent || !feedbackText) return;
      setIsSaving(true);
      
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME, selectedStudent.id);
        await updateDoc(docRef, { teacherFeedback: feedbackText });
        
        // Update local state is handled by onSnapshot, just close modal
        setIsModalOpen(false);
      } catch (error) {
        console.error("Error saving feedback:", error);
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Dashboard Header */}
        <header className="bg-indigo-900 text-white p-6 shadow-md">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Lock size={24} /> 교사용 대시보드
              </h1>
              <p className="text-indigo-200 mt-1 text-sm">통합사회 - 세계 인권지수 탐구 과제 제출 현황</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => downloadCSV(submissions)}
                className="bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Download size={18} /> CSV 다운로드
              </button>
              <button 
                onClick={() => setView('student')}
                className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                학생화면으로
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                <h2 className="font-bold text-slate-800">제출 목록 ({submissions.length}명)</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-sm">
                      <th className="p-4 border-b font-semibold">학번/이름</th>
                      <th className="p-4 border-b font-semibold">선택 국가</th>
                      <th className="p-4 border-b font-semibold">다짐 한 줄</th>
                      <th className="p-4 border-b font-semibold text-center">피드백 상태</th>
                      <th className="p-4 border-b font-semibold text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.length === 0 ? (
                      <tr><td colSpan="5" className="p-8 text-center text-slate-500">아직 제출된 과제가 없습니다.</td></tr>
                    ) : (
                      submissions.map(sub => (
                        <tr key={sub.id} className="hover:bg-slate-50 transition-colors border-b last:border-b-0">
                          <td className="p-4">
                            <div className="font-bold text-slate-800">{sub.studentName}</div>
                            <div className="text-sm text-slate-500">{sub.studentId}</div>
                          </td>
                          <td className="p-4 text-sm text-slate-700">
                            {sub.countries?.join(', ')}
                          </td>
                          <td className="p-4 text-sm text-slate-600 max-w-xs truncate">
                            "{sub.pledge}"
                          </td>
                          <td className="p-4 text-center">
                            {sub.teacherFeedback ? (
                              <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">
                                <CheckCircle size={14} /> 작성완료
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold">
                                <AlertCircle size={14} /> 미작성
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => openFeedbackModal(sub)}
                              className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                            >
                              확인 및 피드백
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>

        {/* Feedback Modal */}
        <Modal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)}
          title={`과제 확인 및 피드백 (${selectedStudent?.studentName})`}
        >
          {selectedStudent && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Student Data */}
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">선택 국가</h4>
                  <p className="font-medium text-slate-800">{selectedStudent.countries?.join(', ')}</p>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">데이터 분석 노트</h4>
                  <div className="text-slate-800 text-sm bg-white p-3 border rounded-lg max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {selectedStudent.analysis}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">공익 광고 기획</h4>
                  <div className="text-slate-800 text-sm bg-white p-3 border rounded-lg max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {selectedStudent.psa}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">세계시민 다짐</h4>
                  <p className="font-medium text-slate-800 italic">"{selectedStudent.pledge}"</p>
                </div>
              </div>

              {/* Right Column: AI Feedback Generation & Edit */}
              <div className="flex flex-col h-full bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-blue-900 flex items-center gap-2">
                    <MessageSquare size={18} /> 맞춤형 피드백 작성
                  </h4>
                  <button 
                    onClick={handleGenerateAI}
                    disabled={isGenerating}
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-70"
                  >
                    {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Edit3 size={14} />}
                    AI 초안 생성
                  </button>
                </div>
                
                <p className="text-xs text-slate-500 mb-3">
                  AI가 성취기준[10통사2-01-03] 및 평가 루브릭에 따라 초안을 작성합니다. 생성 후 자유롭게 수정하여 학생에게 전달하세요.
                </p>

                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="여기에 피드백을 작성하거나 AI로 초안을 생성하세요..."
                  className="flex-1 w-full p-4 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[250px] resize-y mb-4"
                />

                <div className="flex justify-end gap-3 mt-auto">
                  <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg font-medium hover:bg-slate-50">
                    취소
                  </button>
                  <button 
                    onClick={handleSaveFeedback}
                    disabled={isSaving || !feedbackText}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:bg-slate-300 flex items-center gap-2"
                  >
                    {isSaving && <RefreshCw size={16} className="animate-spin" />}
                    피드백 전송 및 저장
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>

      </div>
    );
  };

  return (
    <div className="font-sans text-slate-800">
      {view === 'student' && <StudentView />}
      {view === 'teacher_login' && renderTeacherLogin()}
      {view === 'teacher_dashboard' && <TeacherDashboard />}
    </div>
  );
}