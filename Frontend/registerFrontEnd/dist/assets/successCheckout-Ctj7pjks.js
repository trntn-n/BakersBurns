import{r as s,b as d,j as e}from"./index-rHAb-g9Q.js";const p=()=>{const[o,n]=s.useState(!1),a=d(),i=()=>{a("/store")},r=()=>{n(!0)};return e.jsxs("div",{style:t.backdrop,children:[e.jsx("style",{children:`
    @keyframes flipAndSlide {
      0% {
        transform: rotateY(0) translateX(0);
        opacity: 1;
      }
      50% {
        transform: rotateY(90deg) translateX(0); /* Midpoint of flip */
        opacity: 0.5; /* Slight fade at midpoint */
      }
      100% {
        transform: rotateY(180deg) translateX(100%);
        opacity: 0;
      }
    }
  `})," ",e.jsxs("div",{style:{...t.modal,animation:o?"flipAndSlide 1s forwards":"none"},onAnimationEnd:i,children:[e.jsx("h2",{style:t.heading,children:"Thank you for your purchase!"}),e.jsx("p",{style:t.message,children:"Your order has been successfully placed. We hope to see you again soon!"}),e.jsx("button",{onClick:r,style:{textDecoration:"none",color:"white",padding:"10px 20px",borderRadius:"5px",background:"linear-gradient(to right, blue, lightgreen)",display:"inline-block",textAlign:"center",fontWeight:"bold",border:"none",cursor:"pointer"},children:"Back to Shop"})]})]})},t={backdrop:{position:"fixed",top:0,left:0,width:"100%",height:"100%",backgroundColor:"rgba(0, 0, 0, 0.7)",display:"flex",justifyContent:"center",alignItems:"center",zIndex:1e3},modal:{backgroundColor:"#ffffff",padding:"30px",borderRadius:"10px",maxWidth:"500px",width:"90%",textAlign:"center",boxShadow:"0 4px 8px rgba(0, 0, 0, 0.2)",transformOrigin:"center",backfaceVisibility:"hidden"},heading:{fontSize:"1.8rem",marginBottom:"10px",color:"#333"},message:{fontSize:"1rem",marginBottom:"20px",color:"#555"}};export{p as default};
