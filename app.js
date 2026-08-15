let config,engines=[
{name:"Google",url:"https://www.google.com/search?q=",keyword:"g"},
{name:"Bing",url:"https://www.bing.com/search?q=",keyword:"b"},
{name:"DuckDuckGo",url:"https://duckduckgo.com/?q=",keyword:"ddg"},
{name:"百度",url:"https://www.baidu.com/s?wd=",keyword:"bd"},
{name:"GitHub",url:"https://github.com/search?q=",keyword:"gh"}
],editIndex=-1,layout={columns:6,hide:false};


async function load(){
let saved=localStorage.getItem("homepage");
config=saved?JSON.parse(saved):await fetch("config.json").then(r=>r.json());

if(!config.layout)config.layout={...layout};

let se=localStorage.getItem("engines");
if(se)engines=JSON.parse(se);

renderEngines();
render();
}


function save(){
localStorage.setItem("homepage",JSON.stringify(config));
}


function saveEngines(){
localStorage.setItem("engines",JSON.stringify(engines));
}


function faviconFallback(img,host){
if(!img.dataset.svg){
img.dataset.svg="1";
img.src="https://"+host+"/favicon.svg";
return;
}

if(!img.dataset.google){
img.dataset.google="1";
img.src="https://www.google.com/s2/favicons?domain="+host+"&sz=64";
return;
}

img.onerror=null;
img.src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23ccc'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-size='32'%3E🌐%3C/text%3E%3C/svg%3E";
}


function renderEngines(){
let select=document.getElementById("engine");
select.innerHTML="";

engines.forEach((e,i)=>{
select.innerHTML+=`<option value="${i}">${e.name}</option>`;
});

let index=Number(localStorage.getItem("engineIndex")||0);

if(index>=engines.length)index=0;

select.value=index;
config.search=engines[index].url;

save();

renderEngineList();
renderSearchEngineMenu();
}

function renderEngineList(){
let box=document.getElementById("engine-list");
box.innerHTML="";

engines.forEach((e,i)=>{
box.innerHTML+=`
<div class="engine-sort-item" draggable="true" data-index="${i}">
<div class="engine-title">
<span>${i+1}. ${e.name}</span>
<span onclick="toggleEngineDetail(${i})">⌄</span>
</div>

<div class="engine-detail" id="engine-detail-${i}">
<input value="${e.name}" onchange="editEngine(${i},'name',this.value)">
<input value="${e.url}" onchange="editEngine(${i},'url',this.value)">
<input value="${e.keyword||''}" placeholder="关键词" onchange="editEngine(${i},'keyword',this.value)">
<button onclick="deleteEngine(${i})">删除</button>
</div>
</div>`;
});


let items=box.querySelectorAll(".engine-sort-item");

items.forEach(item=>{
item.ondragstart=e=>{
e.dataTransfer.setData("index",item.dataset.index);
};

item.ondragover=e=>e.preventDefault();

item.ondrop=e=>{
let from=Number(e.dataTransfer.getData("index"));
let to=Number(item.dataset.index);

if(from===to)return;

let x=engines.splice(from,1)[0];
engines.splice(to,0,x);

saveEngines();
renderEngines();
};
});
}


function toggleEngineDetail(i){
let box=document.getElementById("engine-detail-"+i);
if(!box)return;

box.classList.toggle("open");

let title=box.previousElementSibling.querySelector("span:last-child");

if(box.classList.contains("open"))
title.textContent="⌃";
else
title.textContent="⌄";
}


function editEngine(i,key,value){
engines[i][key]=value.trim();

saveEngines();
renderEngines();
}


function deleteEngine(i){
if(engines.length<=1){
alert("至少保留一个搜索引擎");
return;
}

engines.splice(i,1);

saveEngines();

let index=Number(localStorage.getItem("engineIndex")||0);

if(index>=engines.length)
localStorage.setItem("engineIndex",0);

renderEngines();
}


function renderSearchEngineMenu(){
let menu=document.getElementById("search-engine-menu");

if(!menu)return;

menu.innerHTML="";

let index=Number(localStorage.getItem("engineIndex")||0);

let list=[
engines[index],
...engines.filter((e,i)=>i!==index)
];

list.forEach(e=>{
let i=engines.indexOf(e);

menu.innerHTML+=`
<div class="search-engine-item" onclick="changeEngine(${i})">
${e.name}
</div>`;
});
}


function changeEngine(i){
localStorage.setItem("engineIndex",i);

config.search=engines[i].url;

save();

document.getElementById("engine").value=i;

renderSearchEngineMenu();
}


function checkKeyword(k){
k=(k||"").trim().toLowerCase();

if(!k)return true;

return !engines.some((e,i)=>{
return i!==editIndex&&
(e.keyword||"").trim().toLowerCase()===k;
});
}

function addEngine(){
let name=document.getElementById("engine-name");
let url=document.getElementById("engine-url");
let key=document.getElementById("engine-keyword");

let keyword=key.value.trim().toLowerCase();

if(!name.value.trim()||!url.value.trim())return;

if(!checkKeyword(keyword)){
alert("关键词重复");
return;
}

engines.push({
name:name.value.trim(),
url:url.value.trim(),
keyword
});

saveEngines();
renderEngines();

name.value="";
url.value="";
key.value="";
}


function addSite(){

let name=document.getElementById("site-name");
let url=document.getElementById("site-url");


if(!url.value.trim())return;


let data={
 name:name.value.trim() || url.value.trim(),
 url:url.value.trim()
};


if(!data.url.startsWith("http"))
 data.url="https://"+data.url;


config.sites.push(data);


save();
render();


name.value="";
url.value="";

}


function render(){

let box=document.getElementById("sites");

box.innerHTML="";

box.style.setProperty(
"--columns",
config.layout.columns||6
);


if(config.layout.hide){

box.style.display="none";

return;

}else{

box.style.display="grid";

}


config.sites.forEach((site,i)=>{

let host;

try{
host=new URL(site.url).hostname;
}catch{
return;
}


let a=document.createElement("a");

a.className="shortcut";

a.href=site.url;

a.target="_blank";

a.rel="noopener";

a.draggable=true;


let icon="";

if(site.iconType==="emoji"){

icon=`<span>${site.icon||"🌐"}</span>`;

}else if(site.iconType==="url"){

icon=`<img src="${site.icon}">`;

}else{

icon=
`<img src="https://${host}/favicon.ico"
onerror="faviconFallback(this,'${host}')">`;

}


a.innerHTML=`
<div class="shortcut-icon">
${icon}
</div>
<div class="shortcut-title">
${site.name}
</div>`;


a.addEventListener("dragstart",e=>{
e.dataTransfer.setData("index",i);
a.classList.add("dragging");
});


a.addEventListener("dragend",()=>{
a.classList.remove("dragging");
});


a.addEventListener("dragover",e=>{
e.preventDefault();
});


a.addEventListener("drop",e=>{

e.preventDefault();

let from=Number(
e.dataTransfer.getData("index")
);

if(from===i)return;

let item=config.sites.splice(from,1)[0];

config.sites.splice(i,0,item);

save();

render();

});


a.oncontextmenu=e=>{

e.preventDefault();

showCardMenu(i,e.clientX,e.clientY);

};


box.appendChild(a);

});


let add=document.createElement("div");

add.className="shortcut add-card";

add.innerHTML=`
<div class="shortcut-icon add-icon">+</div>
<div class="shortcut-title">
添加卡片
</div>`;

add.onclick=()=>{
    editIndex=-1;

    document.getElementById("card-name").value="";
    document.getElementById("card-url").value="";
    document.getElementById("card-icon-type").value="auto";
    document.getElementById("card-icon").value="";

    document.getElementById("card-editor")
    .classList.add("open");
};

box.appendChild(add);


renderEditor();

}

function showCardMenu(index,x,y){

let old=document.getElementById("card-menu");

if(old)old.remove();


let menu=document.createElement("div");

menu.id="card-menu";


menu.innerHTML=`
<div onclick="editCard(${index})">编辑卡片</div>
<div onclick="removeCard(${index})">删除卡片</div>
<div onclick="this.parentNode.remove()">取消</div>`;


menu.style.left=x+"px";
menu.style.top=y+"px";


document.body.appendChild(menu);

}


function editCard(i){

editIndex=i;

let card=config.sites[i];

document.getElementById("card-name").value=card.name||"";
document.getElementById("card-url").value=card.url||"";
document.getElementById("card-icon-type").value=card.iconType||"auto";
document.getElementById("card-icon").value=card.icon||"";


document.getElementById("card-editor")
.classList.add("open");

}


function removeCard(i){

if(confirm("确定删除此卡片？")){

config.sites.splice(i,1);

save();

render();

}

}


function saveCard(){

let name=document.getElementById("card-name");
let url=document.getElementById("card-url");
let type=document.getElementById("card-icon-type");
let icon=document.getElementById("card-icon");


if(!url.value.trim())return;


let data={
name:name.value.trim()||url.value,
url:url.value.trim(),
iconType:type.value,
icon:icon.value.trim()
};


if(!data.url.startsWith("http"))
data.url="https://"+data.url;


if(editIndex>=0){

config.sites[editIndex]=data;

}else{

config.sites.push(data);

}


save();

render();

closeCardEditor();

}


function closeCardEditor(){

editIndex=-1;

document.getElementById("card-editor")
.classList.remove("open");

}


function renderEditor(){
let box=document.getElementById("editor");
if(!box)return;

box.innerHTML="";

config.sites.forEach((s,i)=>{

box.innerHTML+=`
<div class="card-sort-item" draggable="true" data-index="${i}">

<div class="card-title">
<span>${i+1}. ${s.name}</span>
<span onclick="toggleCardDetail(${i})">⌄</span>
</div>

<div class="card-detail" id="card-detail-${i}">

<input value="${s.name||""}"
onchange="editCardValue(${i},'name',this.value)">

<input value="${s.url||""}"
onchange="editCardValue(${i},'url',this.value)">

<select onchange="editCardValue(${i},'iconType',this.value)">
<option value="auto" ${s.iconType==="auto"?"selected":""}>自动图标</option>
<option value="url" ${s.iconType==="url"?"selected":""}>图片地址</option>
<option value="emoji" ${s.iconType==="emoji"?"selected":""}>Emoji</option>
</select>

<input value="${s.icon||""}"
onchange="editCardValue(${i},'icon',this.value)">

<button onclick="removeCard(${i})">
删除
</button>

</div>

</div>`;

});

let items = box.querySelectorAll(".card-sort-item");

items.forEach(item => {

    item.addEventListener("dragstart", e => {
        e.dataTransfer.setData(
            "index",
            item.dataset.index
        );

        item.classList.add("dragging");
    });


    item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
    });


    item.addEventListener("dragover", e => {
        e.preventDefault();
    });


    item.addEventListener("drop", e => {

        e.preventDefault();

        let from = Number(
            e.dataTransfer.getData("index")
        );

        let to = Number(
            item.dataset.index
        );


        if(from === to) return;


        let moved = config.sites.splice(from,1)[0];

        config.sites.splice(
            to,
            0,
            moved
        );


        save();

        render();

    });

});

}

function toggleCardDetail(i){

let box=document.getElementById(
"card-detail-"+i
);

if(!box)return;

box.classList.toggle("open");

let span=box.previousElementSibling
.querySelector("span:last-child");

span.textContent=
box.classList.contains("open")
?"⌃":"⌄";

}

function editCardValue(i,key,value){

if(key==="url"&&!value.startsWith("http"))
value="https://"+value;

config.sites[i][key]=value;

save();

render();

}

function exportData(){

let data={
sites:config.sites,
engines,
layout:config.layout,
engineIndex:Number(localStorage.getItem("engineIndex")||0)
};


let blob=new Blob(
[JSON.stringify(data,null,2)],
{type:"application/json"}
);


let a=document.createElement("a");

a.href=URL.createObjectURL(blob);

a.download="homepage-backup.json";

a.click();

}


function importData(file){

let reader=new FileReader();


reader.onload=e=>{

try{

let data=JSON.parse(e.target.result);


if(data.sites)
config.sites=data.sites;


if(data.engines)
engines=data.engines;


if(data.layout)
config.layout=data.layout;


if(data.engineIndex!==undefined)
localStorage.setItem(
"engineIndex",
data.engineIndex
);


save();

saveEngines();

renderEngines();

render();


}catch{

alert("导入失败");

}

};


reader.readAsText(file);

}


function updateLayout(){

let input=document.getElementById("card-columns");

let hide=document.getElementById("hide-cards");


let n=Number(input.value);

if(n>=2&&n<=10)
config.layout.columns=n;


config.layout.hide=hide.checked;


save();

render();

}


document.getElementById("settings").onclick=()=>{

let panel=document.getElementById("panel");

panel.style.display=
panel.style.display==="block"?
"none":"block";


if(panel.style.display==="block"){

renderEngineList();

renderEditor();

let c=document.getElementById("card-columns");

let h=document.getElementById("hide-cards");

c.value=config.layout.columns||6;

h.checked=!!config.layout.hide;

}

};



document.querySelectorAll(".collapse-title")
.forEach(t=>{

t.onclick=()=>{

let box=document.getElementById(
t.dataset.target
);

box.classList.toggle("open");


let span=t.querySelector("span");

if(span){

span.textContent=
box.classList.contains("open")?
"⌃":"⌄";

}

};

});



document.getElementById("save-engine").onclick=
addEngine;


document.getElementById("engine").onchange=function(){

let i=Number(this.value);

localStorage.setItem(
"engineIndex",
i
);

config.search=engines[i].url;

save();

renderSearchEngineMenu();

};



document.getElementById("search-engine-btn")
.onclick=()=>{

document.getElementById(
"search-engine-menu"
)
.classList.toggle("open");

};



document.getElementById("save-card")
.onclick=saveCard;


document.getElementById("cancel-card")
.onclick=closeCardEditor;



document.getElementById("export-data")
.onclick=exportData;



document.getElementById("import-data")
.onchange=function(){

if(this.files[0])
importData(this.files[0]);

};



document.getElementById("card-columns")
.onchange=updateLayout;


document.getElementById("hide-cards")
.onchange=updateLayout;

document.getElementById("save-site").onclick=addSite;


document.getElementById("search").onsubmit=e=>{

e.preventDefault();

let q=document.getElementById("query")
.value.trim();


if(!q)return;


let arr=q.split(/\s+/);

let key=arr[0]
.toLowerCase();


let engine=engines.find(e=>
(e.keyword||"")
.toLowerCase()===key
);


if(engine){

q=arr.slice(1).join(" ");

if(q){

location.href=
engine.url+
encodeURIComponent(q);

}

return;

}


if(q.startsWith("!")){

q=q.slice(1).trim();

location.href=
config.search+
encodeURIComponent(q);

return;

}


location.href=
config.search+
encodeURIComponent(q);

};



load();