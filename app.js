import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyDaQMV5tsxi556X0wCjWaj-W-mLmM0EF2Y",
    authDomain: "sakrebulo.firebaseapp.com",
    projectId: "sakrebulo",
    storageBucket: "sakrebulo.firebasestorage.app",
    messagingSenderId: "1080316572069",
    appId: "1:1080316572069:web:b67cd8e0ba1865fc3ab84c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const issuesRef = collection(db, "issues");

// --- ავტორიზაციის და ნავიგაციის ლოგიკა --- //
let currentRole = null;
let loggedInUser = null;

// სატესტო პაროლები და PIN-ები (მომავალში ამას Firebase-ის Users კოლექციაში გადავიტანთ)
const ADMIN_PASSWORD = "admin";
const DEPUTIES = {
    "1111": { id: "deputy_01", name: "გიორგი გიორგაძე" },
    "2222": { id: "deputy_02", name: "ნინო ნინოშვილი" }
};

window.showHome = () => {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('screen-home').classList.add('active');
    document.getElementById('passwordInput').value = "";
    currentRole = null;
};

window.showLogin = (role) => {
    currentRole = role;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('loginTitle').innerText = role === 'admin' ? "აპარატის პაროლი" : "დეპუტატის PIN კოდი";
    document.getElementById('passwordInput').focus();
};

window.handleEnter = (e) => { if (e.key === 'Enter') login(); };

window.login = () => {
    const input = document.getElementById('passwordInput').value;
    
    if (currentRole === 'admin') {
        if (input === ADMIN_PASSWORD) {
            document.getElementById('screen-login').classList.remove('active');
            document.getElementById('screen-admin').classList.add('active');
            initAdmin();
        } else { alert("არასწორი პაროლი!"); }
    } 
    else if (currentRole === 'deputy') {
        if (DEPUTIES[input]) {
            loggedInUser = DEPUTIES[input];
            document.getElementById('deputyName').innerText = loggedInUser.name;
            document.getElementById('screen-login').classList.remove('active');
            document.getElementById('screen-deputy').classList.add('active');
            initDeputy();
        } else { alert("არასწორი PIN კოდი!"); }
    }
};

window.logout = () => {
    loggedInUser = null;
    showHome();
};


// --- აპარატის (ადმინის) ლოგიკა --- //
function initAdmin() {
    window.addIssue = async function() {
        const title = document.getElementById("issueTitle").value;
        const file = document.getElementById("issueFile").files[0];
        const btn = document.getElementById("addBtn");

        if (!title || !file) return alert("შეავსეთ სათაური და აირჩიეთ PDF ფაილი!");
        
        btn.innerText = "იტვირთება..."; btn.disabled = true;

        try {
            const fileRef = ref(storage, 'documents/' + Date.now() + '_' + file.name);
            await uploadBytes(fileRef, file);
            const fileUrl = await getDownloadURL(fileRef);

            await addDoc(issuesRef, { title, fileUrl, fileName: fileRef.name, status: "pending", createdAt: new Date().toISOString() });
            
            document.getElementById("issueTitle").value = "";
            document.getElementById("issueFile").value = "";
        } catch (e) { alert("შეცდომა ატვირთვისას"); }
        btn.innerText = "დამატება"; btn.disabled = false;
    };

    window.changeStatus = async (id, status) => updateDoc(doc(db, "issues", id), { status });
    
    window.deleteIssue = async (id, fileName) => {
        if(!confirm("ნამდვილად გსურთ წაშლა?")) return;
        try { await deleteObject(ref(storage, 'documents/' + fileName)); await deleteDoc(doc(db, "issues", id)); } 
        catch (e) { console.error(e); }
    };

    onSnapshot(query(issuesRef, orderBy("createdAt", "desc")), (snapshot) => {
        const list = document.getElementById("issuesList");
        let htmlContent = ""; 
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            let statusText = data.status === "pending" ? "მოლოდინში" : (data.status === "voting" ? "მიმდინარეობს" : "დასრულებული");

            htmlContent += `
                <div class="issue-card">
                    <h3>${data.title} (${statusText})</h3>
                    <div class="live-stats" id="stats-${id}">ხმები ითვლება...</div>
                    <div style="margin-top: 15px;">
                        <button class="btn-start" onclick="changeStatus('${id}', 'voting')">დაწყება</button>
                        <button class="btn-stop" onclick="changeStatus('${id}', 'closed')">დასრულება</button>
                        <button class="btn-del" onclick="deleteIssue('${id}', '${data.fileName}')">წაშლა</button>
                    </div>
                </div>`;
        });
        list.innerHTML = htmlContent;

        snapshot.forEach(docSnap => {
            const id = docSnap.id;
            onSnapshot(collection(db, "issues", id, "votes"), (voteSnap) => {
                let yes = 0, no = 0, abs = 0;
                voteSnap.forEach(v => {
                    if(v.data().vote === 'yes') yes++;
                    if(v.data().vote === 'no') no++;
                    if(v.data().vote === 'abstain') abs++;
                });
                const statDiv = document.getElementById(`stats-${id}`);
                if(statDiv) statDiv.innerHTML = `მომხრე: <span style="color:green">${yes}</span> | წინააღმდეგი: <span style="color:red">${no}</span> | თავი შეიკავა: <span style="color:orange">${abs}</span>`;
            });
        });
    });
}


// --- დეპუტატის ლოგიკა --- //
function initDeputy() {
    let currentId = null;
    const preloaded = new Set(); 

    onSnapshot(issuesRef, (snapshot) => {
        if (!loggedInUser) return; // თუ გამოსულია, არაფერი ვქნათ

        let activeFound = false;
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            if(data.fileUrl && !preloaded.has(data.fileUrl)) {
                const link = document.createElement('link'); link.rel = 'prefetch'; link.href = data.fileUrl;
                document.head.appendChild(link); preloaded.add(data.fileUrl);
            }

            if(data.status === 'voting') {
                activeFound = true;
                if (currentId !== docSnap.id) {
                    currentId = docSnap.id;
                    document.getElementById('btnYes').disabled = false;
                    document.getElementById('btnNo').disabled = false;
                    document.getElementById('btnAbs').disabled = false;
                    document.getElementById('voteIssueTitle').innerText = data.title;
                    document.getElementById('pdfFrame').src = data.fileUrl;
                }
                document.getElementById('waiting').style.display = 'none';
                document.getElementById('votingSection').style.display = 'flex';
            }
        });

        if(!activeFound) {
            currentId = null;
            document.getElementById('waiting').style.display = 'flex';
            document.getElementById('votingSection').style.display = 'none';
            document.getElementById('pdfFrame').src = "";
        }
    });

    window.vote = async (v) => {
        if(!currentId || !loggedInUser) return;
        
        ['btnYes', 'btnNo', 'btnAbs'].forEach(id => document.getElementById(id).disabled = true);

        try {
            await setDoc(doc(db, "issues", currentId, "votes", loggedInUser.id), {
                vote: v, timestamp: new Date().toISOString()
            });
            alert("თქვენი ხმა მიღებულია!");
        } catch (e) {
            alert("შეცდომა! სცადეთ თავიდან.");
            ['btnYes', 'btnNo', 'btnAbs'].forEach(id => document.getElementById(id).disabled = false);
        }
    };
}