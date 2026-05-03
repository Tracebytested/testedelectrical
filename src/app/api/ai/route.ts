import { NextRequest, NextResponse } from 'next/server'
import { generateReportFromDescription } from '@/lib/ai'
import { findAllInspectionReports, downloadDriveFile, getRecentJobPhotos } from '@/lib/drive'
import { createCalendarEvent } from '@/lib/calendar'
import { generateReportPDF, generateInvoicePDF, generateQuotePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { query } from '@/lib/db'
import { getNextReportNumber, getNextInvoiceNumber, getNextBeezyInvoiceNumber, getNextJobNumber, getNextQuoteNumber, calculateLineItems, formatDate, formatDateLong, findOrCreateClient } from '@/lib/utils'
import { BUSINESS, AGENT } from '@/lib/constants'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function findClientByName(name: string): Promise<any | null> {
  const words = name.split(/\s+/).filter(w => w.length >= 3)
  for (const w of words) {
    const r = await query('SELECT * FROM clients WHERE name ILIKE $1 LIMIT 1', ['%' + w + '%'])
    if (r.rows.length > 0) return r.rows[0]
  }
  return null
}

async function findJobByRef(body: string): Promise<any | null> {
  const ref = body.match(/([JW]O?[-#]?\d{3,6})/i)
  if (ref) {
    const r = await query('SELECT j.*, c.name as client_name, c.email as client_email, c.company as client_company, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.job_number ILIKE $1 OR j.work_order_ref ILIKE $1 LIMIT 1', ['%' + ref[1] + '%'])
    if (r.rows.length > 0) return r.rows[0]
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    const [recentJobs, recentClients] = await Promise.all([
      query('SELECT j.job_number, j.title, j.status, j.site_address, c.name as client, c.email as client_email FROM jobs j LEFT JOIN clients c ON j.client_id = c.id ORDER BY j.created_at DESC LIMIT 10').catch(() => ({ rows: [] })),
      query('SELECT name, email, company FROM clients ORDER BY name ASC LIMIT 20').catch(() => ({ rows: [] }))
    ])
    const today = new Date().toISOString().split('T')[0]
    const priceListResult = await query('SELECT item_name, price, category FROM pricelist ORDER BY item_name').catch(() => ({ rows: [] }))
    const priceListStr = priceListResult.rows.length > 0 ? ' Price list: ' + JSON.stringify(priceListResult.rows) + ' Use these prices when Nathan mentions these items.' : ''
    const aiPlan = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 800,
      messages: [{ role: 'user', content: 'You are Beezy, AI admin for Tested Electrical. Today is ' + today + '. Clients: ' + JSON.stringify(recentClients.rows) + ' Jobs: ' + JSON.stringify(recentJobs.rows) + ' Nathan asked: "' + message.replace(/"/g, "'") + '" Return ONLY JSON: {"actions":["create_job","generate_report","generate_invoice","generate_quote","attach_from_drive","book_calendar","send_email","general_reply"],"driveSearchTerms":["term"],"driveRecentOnly":false,"driveImagesInReport":false,"driveImagesAttachEmail":false,"clientName":"company","billToName":"liable person","recipientEmail":"email","ccEmail":"cc email if mentioned","siteAddress":"address","price":0,"lineItems":[{"description":"...","qty":1,"rate":100}],"customEmailBody":"","emailSubject":"","jobDescription":"","jobTitle":"","calendarDate":"","calendarTime":"","reportDescription":"","reply":"reply if general"} Rules: actions can have multiple. lineItems rate>0 total=price. driveImagesInReport=true to embed in report. price is ex GST.' + priceListStr }]
    })
    let plan: any = {}
    try {
      const t = aiPlan.content[0].type === 'text' ? aiPlan.content[0].text : '{}'
      plan = JSON.parse(t.replace(/```json|```/g, '').trim())
    } catch { return NextResponse.json({ response: "Couldn't understand that. Try rephrasing." }) }

    const actions: string[] = plan.actions || []
    if (actions.length === 1 && actions[0] === 'general_reply') return NextResponse.json({ response: plan.reply || 'Got it!' })

    const price = plan.price || 0
    let email = plan.recipientEmail || null
    let clientName = plan.clientName || 'Client'
    let billToName = plan.billToName || clientName
    let companyName: string | undefined
    let siteAddress = plan.siteAddress || ''
    const jobRef = await findJobByRef(message)
    const dbClient = await findClientByName(clientName)
    if (dbClient) { if (!email && dbClient.email) email = dbClient.email; companyName = dbClient.company || dbClient.name; clientName = dbClient.name }
    if (!email && jobRef?.client_email) email = jobRef.client_email
    if (!siteAddress && jobRef?.site_address) siteAddress = jobRef.site_address
    if (!companyName && clientName !== billToName) companyName = clientName

    const parts: string[] = []
    if (actions.includes('create_job')) parts.push('Create work order: "' + (plan.jobTitle || 'New Job') + '"')
    if (actions.includes('attach_from_drive')) parts.push('Attach from Drive: "' + (plan.driveSearchTerms || []).join(', ') + '"')
    if (actions.includes('generate_report')) parts.push('Generate report' + (plan.driveImagesInReport ? ' (with images)' : ''))
    if (actions.includes('generate_invoice') && price > 0) { const it = (plan.lineItems||[]).filter((i:any)=>i.rate!==0); parts.push(it.length>0 ? 'Invoice: '+it.map((i:any)=>i.description+' x'+i.qty+' $'+i.rate).join(', ')+' ($'+(price*1.1).toFixed(2)+' inc GST)' : 'Invoice $'+(price*1.1).toFixed(2)+' inc GST') }
    if (actions.includes('generate_quote') && price > 0) parts.push('Quote $' + (price*1.1).toFixed(2) + ' inc GST')
    if (actions.includes('book_calendar')) parts.push('Book: ' + (plan.calendarDate||'') + (plan.calendarTime ? ' at '+plan.calendarTime : ''))
    if (actions.includes('send_email')) parts.push('Send email')

    plan.resolvedEmail = email; plan.resolvedClientName = clientName; plan.resolvedBillToName = billToName
    plan.resolvedCompanyName = companyName; plan.resolvedAddress = siteAddress; plan.resolvedJobId = jobRef?.id || null; plan.price = price

    return NextResponse.json({
      response: parts.join('\n') + '\n\nSend to: ' + (email||'NO EMAIL') + (plan.ccEmail ? '\nCC: ' + plan.ccEmail : '') + '\nBill to: ' + billToName + (companyName && companyName !== billToName ? ' ('+companyName+')' : '') + (siteAddress ? '\nAddress: '+siteAddress : ''),
      needsConfirmation: true, plan
    })
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const { plan } = await req.json()
    const actions: string[] = plan.actions || []
    const price = plan.price || 0
    const email = plan.resolvedEmail || null
    const clientName = plan.resolvedClientName || 'Client'
    const billToName = plan.resolvedBillToName || clientName
    const companyName = plan.resolvedCompanyName || undefined
    const siteAddress = plan.resolvedAddress || ''
    let jobRef: any = null
    if (plan.resolvedJobId) { const jr = await query('SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.id = $1', [plan.resolvedJobId]); if (jr.rows.length > 0) jobRef = jr.rows[0] }

    const attachments: Array<{filename:string;content:Buffer;contentType:string}> = []
    const results: string[] = []

    if (actions.includes('create_job')) {
      const cid = await findOrCreateClient({ name: clientName, is_agency: false }); const jn = await getNextJobNumber()
      await query("INSERT INTO jobs (job_number,client_id,title,description,site_address,status,source) VALUES ($1,$2,$3,$4,$5,'pending','dashboard')", [jn,cid,plan.jobTitle||'New Job',plan.jobDescription||'',siteAddress])
      results.push('Work order '+jn)
    }

    if (actions.includes('attach_from_drive')) {
      for (const term of (plan.driveSearchTerms||[])) {
        let files = await findAllInspectionReports(term)
        if (plan.driveRecentOnly) { const s=new Date();s.setHours(0,0,0,0); files=files.filter((f:any)=>!f.modifiedTime||new Date(f.modifiedTime)>=s) }
        for (const file of files) {
          if (attachments.find(a=>a.filename===file.name)) continue
          const nm=(file.name||'').toLowerCase(); const mm=(file.mimeType||'').toLowerCase()
          const isImg=mm.includes('image')||nm.endsWith('.jpg')||nm.endsWith('.jpeg')||nm.endsWith('.png')
          if (isImg && plan.driveImagesInReport && !plan.driveImagesAttachEmail) continue
          const buf=await downloadDriveFile(file.id); let fn=(file.name as string).replace(/\//g,'-').replace(/\\/g,'-')
          if (!fn.toLowerCase().endsWith('.pdf')&&!fn.toLowerCase().endsWith('.jpg')&&!fn.toLowerCase().endsWith('.png')) fn+='.pdf'
          attachments.push({filename:fn,content:buf,contentType:file.mimeType||'application/pdf'})
        }
      }
      if (attachments.length>0) results.push(attachments.length+' file(s) from Drive')
    }

    if (actions.includes('generate_report')) {
      const rd=await generateReportFromDescription({nathanDescription:plan.reportDescription||plan.jobDescription||'',jobTitle:plan.jobTitle||jobRef?.title||'Service Report',client:clientName,siteAddress,workOrderRef:jobRef?.work_order_ref})
      if (price>0) rd.price_ex_gst=price
      let photos:Buffer[]=[]
      try {
        const pf=await getRecentJobPhotos(siteAddress,plan.driveRecentOnly||false); if(pf.length>0){const b=await Promise.all(pf.map((f:any)=>downloadDriveFile(f.id).catch(()=>null)));photos=b.filter((x):x is Buffer=>x!==null)}
        if(plan.driveImagesInReport&&plan.driveSearchTerms){for(const term of plan.driveSearchTerms){const df=await findAllInspectionReports(term);for(const f of df.filter((f:any)=>{const n=(f.name||'').toLowerCase();const m=(f.mimeType||'').toLowerCase();return m.includes('image')||n.endsWith('.jpg')||n.endsWith('.png')})){const buf=await downloadDriveFile(f.id).catch(()=>null);if(buf)photos.push(buf)}}}
      }catch{}
      const rn=await getNextReportNumber()
      if(jobRef)await query("INSERT INTO reports (report_number,job_id,client_id,title,task_information,investigation_findings,work_undertaken,remedial_action,recommended_followup,price_ex_gst,conducted_date,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')",[rn,jobRef.id,jobRef.client_id,rd.title,rd.task_information,rd.investigation_findings,rd.work_undertaken,rd.remedial_action,rd.recommended_followup,rd.price_ex_gst,new Date()])
      const rpdf=await generateReportPDF({photos,report_number:rn,conducted_on:formatDateLong(new Date()),title:rd.title,status:'Completed',site_location:siteAddress,work_order:jobRef?.work_order_ref||'',client:clientName,contact:jobRef?.agency_contact||'',date_completed:formatDate(new Date()),task_information:rd.task_information,investigation_findings:rd.investigation_findings,work_undertaken:rd.work_undertaken,remedial_action:rd.remedial_action,recommended_followup:rd.recommended_followup,price_ex_gst:rd.price_ex_gst})
      attachments.push({filename:rn+'_Service_Report.pdf',content:rpdf,contentType:'application/pdf'})
      results.push('Report '+rn)
    }

    if(actions.includes('generate_invoice')&&price>0){
      let items=(plan.lineItems||[]).filter((i:any)=>i.rate!==0&&i.qty>0);if(items.length===0)items=[{description:plan.jobTitle||'Electrical Services',qty:1,rate:price}]
      const{lineItems,subtotal,gst,total}=calculateLineItems(items);const inv=await getNextBeezyInvoiceNumber()
      if(jobRef)await query("INSERT INTO invoices (invoice_number,job_id,client_id,line_items,subtotal,gst,total,status,due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8)",[inv,jobRef.id,jobRef.client_id,JSON.stringify(lineItems),subtotal,gst,total,new Date(Date.now()+7*86400000)])
      const ip=await generateInvoicePDF({invoice_number:inv,date:formatDate(new Date()),bill_to_name:billToName,bill_to_company:companyName,bill_to_address:siteAddress,line_items:lineItems,subtotal,gst,total})
      attachments.push({filename:'Invoice_'+inv+'.pdf',content:ip,contentType:'application/pdf'});results.push('Invoice '+inv+' ($'+total.toFixed(2)+' inc GST)')
    }

    if(actions.includes('generate_quote')&&price>0){
      let items=(plan.lineItems||[]).filter((i:any)=>i.rate!==0&&i.qty>0);if(items.length===0)items=[{description:plan.jobTitle||'Electrical Services',qty:1,rate:price}]
      const{lineItems,subtotal,gst,total}=calculateLineItems(items);const qn=await getNextQuoteNumber()
      const qp=await generateQuotePDF({quote_number:qn,date:formatDate(new Date()),quote_to_name:billToName,quote_to_address:siteAddress,line_items:lineItems,subtotal,gst,total,notes:[]})
      attachments.push({filename:'Quote_'+qn+'.pdf',content:qp,contentType:'application/pdf'});results.push('Quote '+qn+' ($'+total.toFixed(2)+' inc GST)')
    }

    if(actions.includes('book_calendar')&&plan.calendarDate){
      await createCalendarEvent({title:plan.jobTitle||'Job',description:plan.jobDescription,location:siteAddress,startDate:plan.calendarDate,startTime:plan.calendarTime});results.push('Calendar booked')
    }

    if((actions.includes('send_email')||attachments.length>0)&&email){
      let eb='';if(plan.customEmailBody){eb='<p>'+plan.customEmailBody.split('\n').join('<br>')+'</p>'}else{const dt:string[]=[];if(results.some(r=>r.includes('Report')))dt.push('service report');if(results.some(r=>r.includes('Invoice')))dt.push('invoice');if(results.some(r=>r.includes('Quote')))dt.push('quote');if(results.some(r=>r.includes('file')))dt.push('requested documents');eb='<p>Hi,</p><p>Please see attached '+(dt.length>0?dt.join(' and '):'attached documents')+'.</p>'}
      await sendEmail({to:email,cc:plan.ccEmail||undefined,subject:plan.emailSubject||results.join(' + ')+' - Tested Electrical',body:buildEmailHTML(eb+"<p>Any questions or issues opening please let me know.</p><p>Kind Regards,<br>Nathan's Assistant B</p>"),attachments})
      results.push('Sent to '+email)
    }

    if(actions.includes('generate_report')&&jobRef)await query("UPDATE jobs SET status='completed', completed_date=$1, updated_at=NOW() WHERE id=$2",[new Date(),jobRef.id])
    return NextResponse.json({response:results.join(', ')+'. Done!'})
  }catch(error:any){console.error('AI execute error:',error);return NextResponse.json({error:error.message},{status:500})}
}
