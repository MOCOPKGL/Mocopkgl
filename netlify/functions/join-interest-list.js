const STORE_NAME = "pkgl-join-interest";

async function getAdminSession(SUPABASE_URL,SERVICE_KEY,token){
  if(!token)return null;

  const q=new URLSearchParams({
    select:"is_admin",
    token:`eq.${token}`,
    expires_at:`gt.${new Date().toISOString()}`,
    limit:"1"
  });

  const res=await fetch(
    `${SUPABASE_URL}/rest/v1/pkgl_sessions?${q.toString()}`,
    {
      headers:{
        apikey:SERVICE_KEY,
        Authorization:`Bearer ${SERVICE_KEY}`
      }
    }
  );

  if(!res.ok)return null;

  const rows=await res.json();
  return rows[0]||null;
}

async function getInterestStore(){
  const { getStore } = await import("@netlify/blobs");
  return getStore(STORE_NAME);
}

exports.handler = async function(event){
  try{
    if(event.httpMethod!=="POST"){
      return {
        statusCode:405,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Method not allowed"})
      };
    }

    const SUPABASE_URL=process.env.SUPABASE_URL;
    const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!SUPABASE_URL||!SERVICE_KEY){
      throw new Error("Server configuration is missing.");
    }

    const {token}=JSON.parse(event.body||"{}");

    const session=await getAdminSession(
      SUPABASE_URL,
      SERVICE_KEY,
      token
    );

    if(!session||session.is_admin!==true){
      return {
        statusCode:403,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Administrator access required."})
      };
    }

    const store=await getInterestStore();
    const listed=await store.list();
    const blobs=Array.isArray(listed&&listed.blobs)
      ?listed.blobs
      :[];

    const submissions=await Promise.all(
      blobs
        .filter(x=>x&&x.key&&x.key.endsWith(".json"))
        .map(async blob=>{
          try{
            const row=await store.get(
              blob.key,
              {type:"json"}
            );

            if(!row||typeof row!=="object"){
              return null;
            }

            const date=row.submitted_at
              ?new Date(row.submitted_at)
              :null;

            return {
              ...row,
              submitted_display:
                date&&!Number.isNaN(date.getTime())
                ?date.toLocaleString(
                  "en-US",
                  {
                    month:"short",
                    day:"numeric",
                    year:"numeric",
                    hour:"numeric",
                    minute:"2-digit"
                  }
                )
                :""
            };
          }catch{
            return null;
          }
        })
    );

    submissions.sort((a,b)=>
      String(b&&b.submitted_at||"")
        .localeCompare(
          String(a&&a.submitted_at||"")
        )
    );

    return {
      statusCode:200,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({
        submissions:submissions.filter(Boolean)
      })
    };
  }catch(error){
    console.error("join-interest-list",error);

    return {
      statusCode:500,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({
        error:"Unable to load the interest list."
      })
    };
  }
};
