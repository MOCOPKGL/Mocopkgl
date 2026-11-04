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

    const q=new URLSearchParams({
      select:"first_name,last_name,approximate_handicap,kid_name,kid_age,city_of_residence,email,phone,submitted_at",
      order:"submitted_at.desc"
    });

    const response=await fetch(
      `${SUPABASE_URL}/rest/v1/pkgl_join_interest?${q.toString()}`,
      {
        headers:{
          apikey:SERVICE_KEY,
          Authorization:`Bearer ${SERVICE_KEY}`
        }
      }
    );

    const text=await response.text();

    if(!response.ok){
      console.error("join-interest list failed",response.status,text);
      throw new Error("Unable to load the interest list.");
    }

    const rows=JSON.parse(text||"[]").map(row=>{
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
    });

    return {
      statusCode:200,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({submissions:rows})
    };
  }catch(error){
    console.error("join-interest-list",error);
    return {
      statusCode:500,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({error:"Unable to load the interest list."})
    };
  }
};
