const BUCKET = "PKGL Join Interest";

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

exports.handler = async function(event){
  try{
    if(event.httpMethod!=="POST"){
      return {statusCode:405,body:JSON.stringify({error:"Method not allowed"})};
    }

    const SUPABASE_URL=process.env.SUPABASE_URL;
    const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!SUPABASE_URL||!SERVICE_KEY){
      throw new Error("Server configuration is missing.");
    }

    const {token}=JSON.parse(event.body||"{}");
    const session=await getAdminSession(SUPABASE_URL,SERVICE_KEY,token);

    if(!session||session.is_admin!==true){
      return {
        statusCode:403,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Administrator access required."})
      };
    }

    const headers={
      apikey:SERVICE_KEY,
      Authorization:`Bearer ${SERVICE_KEY}`,
      "Content-Type":"application/json"
    };

    const list=await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(BUCKET)}`,
      {
        method:"POST",
        headers,
        body:JSON.stringify({
          prefix:"",
          limit:250,
          offset:0,
          sortBy:{column:"created_at",order:"desc"}
        })
      }
    );

    if(list.status===404){
      return {
        statusCode:200,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({submissions:[]})
      };
    }

    if(!list.ok){
      const text=await list.text();
      if(/bucket.*not found/i.test(text)){
        return {
          statusCode:200,
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({submissions:[]})
        };
      }
      throw new Error(text||"Unable to list interest submissions.");
    }

    const files=(await list.json()).filter(x=>x&&x.name&&x.name.endsWith(".json"));

    const submissions=await Promise.all(
      files.map(async file=>{
        const res=await fetch(
          `${SUPABASE_URL}/storage/v1/object/authenticated/${encodeURIComponent(BUCKET)}/${encodeURIComponent(file.name)}`,
          {
            headers:{
              apikey:SERVICE_KEY,
              Authorization:`Bearer ${SERVICE_KEY}`
            }
          }
        );

        if(!res.ok)return null;

        const row=await res.json();

        const date=row.submitted_at?new Date(row.submitted_at):null;

        return {
          ...row,
          submitted_display:
            date&&!Number.isNaN(date.getTime())
            ?date.toLocaleString("en-US",{
              month:"short",
              day:"numeric",
              year:"numeric",
              hour:"numeric",
              minute:"2-digit"
            })
            :""
        };
      })
    );

    submissions.sort((a,b)=>
      String(b&&b.submitted_at||"").localeCompare(String(a&&a.submitted_at||""))
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
    return {
      statusCode:500,
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({error:error.message||"Unable to load the interest list."})
    };
  }
};
