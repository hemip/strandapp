package com.teraim.strand;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.text.SpannableString;
import android.text.style.UnderlineSpan;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.View.OnClickListener;
import android.view.ViewGroup;
import android.view.ViewGroup.LayoutParams;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.Spinner;
import android.widget.TextView;

import com.teraim.strand.dataobjekt.InputAlertBuilder;
import com.teraim.strand.dataobjekt.InputAlertBuilder.AlertBuildHelper;
import com.teraim.strand.dataobjekt.TableDeponi;
import com.teraim.strand.utils.Constants;

/**
 *
 * @author Terje
 *
 * Class that allows dividing beach into zones.
 */
public class ActivityZoneSplit extends M_Activity {
	//HYDRO
	private static final int ID_Vattendjup = 3;
	private static final int ID_Brygga = 4;
	private static final int ID_Vasslen = 5;
	private static final int ID_Vasstathet = 6;
	private static final int ID_VågExponering = 7;
	private static final int ID_Strandtyp = 8;
	private static final int ID_Kusttyp = 9;
	//EXTRA
	private static final int ID_SlutlenOvan = 11;
	private static final int ID_LutningExtra = 12;
	private static final int ID_MarktypExtra = 13;
	private static final int ID_VegtackningExtra = 14;
	private static final int ID_TradtackningExtra  =15;
	//GEO
	private static final int ID_SlutlenGeo= 20;
	private static final int ID_LutningGeo= 21;
	private static final int ID_MarktypGeo= 22;
	private static final int ID_tacknfaltGeo=23;
	private static final int ID_TradtackningGeo =24;
	//SUPRA
	private static final int ID_SlutlenSupra= 30;
	private static final int ID_LutningSupra= 31;
	private static final int ID_MarktypSupra = 33;
	private static final int ID_VegtackningsfaltSupra = 34;
	private static final int ID_TradtackningSupra = 35;
	//ÖVRIGT
	private static final int ID_Rekreation = 40;
	private static final int ID_Rojning = 41;
	private static final int ID_Rojningstid = 42;
	private static final int ID_KlippaMax = 43;
	private static final int ID_Stangsel = 44;
	//HABITAT

	//TRÄD
	private static final int ID_Tradforekomst = 60;
	//BUSKAR
	private static final int ID_Busktackning = 70;
	private static final int STATE_EXTRA = 1;
	private static final int STATE_SUPRA = 2;
	private static final int STATE_GEO = 3;
	private static final int STATE_HYDRO = 4;
	private static final int STATE_OVRIGT= 5;
	private static final int STATE_HABITAT = 6;
	private static final int STATE_TRÄD = 7;
	private static final int STATE_DEPONI = 8;
	private static final int STATE_BUSKAR = 9;
	private static final int STATE_DRIFT = 10;

	private static final ArrayList<String> rekreationsTyper = new ArrayList<String>(Arrays.asList(
			"Badplats",
			"Golfbana",
			"Camping",
			"Slalombacke",
			"Annan motionsanläggning",
			"Park",
			"Annan rekreationsyta"
	));
	public static final ArrayList<String> markTyper = new ArrayList<String>(Arrays.asList(
			"Åker - Träda/ingen synbar markanv.",
			"Åker- Nyligen markbearbetad/harvad/sådd",
			"Åker- Annuella grödor",
			"Åker- Slåttervall",
			"Åker- Betad vall",
			"Åker- Energiskog",
			"Åker- Frukt/Bärodling",
			"Anlagd - Ingen synbar markanv.",
			"Anlagd - Kolonilottsodling",
			"Anlagd - Rekreation (anläggning)",
			"Anlagd - Bostadstomt Enskilt eller få (<= 5)",
			"Anlagd - Tätortsbebyggelse flera bostadshus (>5)",
			"Anlagd - Jordbruksbebyggelse Byggnader, gårdsplaner",
			"Anlagd - Industriverksamhet",
			"Anlagd - Transport",
			"Anlagd - Pågående exploatering/väg/bygge",
			"Skog - Pot. skogsbruk, inga avverkningsspår",
			"Skog - Skogsbruk",
			"Skog - Skogsbruk, hänsynsyta",
			"Skog - Hygge",
			"Skog - Fröplantage",
			"Skog - Kraftledningsgata",
			"Skog - Skogsbete (+skogsbruk)",
			"Skog - Rekreation (+skogsbruk)",
			"Skog - Nyligen skogsplanterad åker",
			"Övrig - Ingen synbar markanvändning",
			"Övrig - Djurhållnig, naturmark",
			"Övrig - Djurhållning, kultiverad/gödslad mark",
			"Övrig - Slåtter/gräsklippning",
			"Övrig - Rekreation",
			"Övrig - Bostadstomt",
			"Övrig - Täkt",
			"Vatten"));
	public static final ArrayList<String> markTypKoder = new ArrayList<String>(Arrays.asList(
			"10","11","12","13","14","15","16","20","21","22","23","24","25","26","27","28","30",
			"31","32","33","34","35","36","37","38","40","41","42","43","44","45","46","50"));
	protected static final String TypeDigit = "DIGIT";
	TextView extraT,supraT,geoT,hydroT,övrigtT,habitatT,trädT,deponiT,buskarT,driftT;
	LinearLayout bg;
	private View deponiV = null;
	private TableDeponi tableDeponi=null;

	//convenience..
	Provyta py = Strand.getCurrentProvyta(this);
	private int myDisplayState;


	private List<String> values;
	private List<String> entries;



	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		if (savedInstanceState !=null) {
			myDisplayState = savedInstanceState.getInt(Constants.KEY_ZONE_DISPLAY_STATE);
		}
		setContentView(R.layout.activity_zone_split);

		extraT = (TextView)this.findViewById(R.id.extraT);
		supraT = (TextView)this.findViewById(R.id.supraT);
		geoT = (TextView)this.findViewById(R.id.geoT);
		hydroT = (TextView)this.findViewById(R.id.hydroT);
		övrigtT = (TextView)this.findViewById(R.id.ovrigtT);
		habitatT = (TextView)this.findViewById(R.id.habitatT);
		trädT = (TextView)this.findViewById(R.id.tradT);
		deponiT = (TextView)this.findViewById(R.id.deponiT);
		buskarT = (TextView)this.findViewById(R.id.buskT);
		driftT = (TextView)this.findViewById(R.id.driftT);


		//Main view that will be filled with variables depending on zone.
		bg = (LinearLayout)this.findViewById(R.id.contentPane);


		//Table for Depooni
		tableDeponi = new TableDeponi((Activity)this,py.getDeponi());

		extraT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {

				myDisplayState = STATE_EXTRA;
				goExtra();
			}});

		supraT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_SUPRA;
				goSupra();
			}});

		hydroT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_HYDRO;
				goHydro();
				Log.d("Strand","EWTTERERWRE????");
			}});

		geoT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_GEO;
				goGeo();
			}});

		övrigtT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_OVRIGT;
				goOvrigt();
			}});

		habitatT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_HABITAT;
				goHabitat();
			}});

		extraT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_EXTRA;
				goExtra();
			}});

		trädT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_TRÄD;
				goTräd();
			}});

		deponiT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_DEPONI;
				goDeponi();
			}});

		buskarT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_BUSKAR;
				goBuskar();
			}});

		driftT.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View v) {
				myDisplayState = STATE_DRIFT;
				goDrift();

			}});

		switch (myDisplayState) {
			case STATE_GEO:
				goGeo();
				break;
			case STATE_EXTRA:
				goExtra();
				break;
			case STATE_HYDRO:
				goHydro();
				break;
			case STATE_SUPRA:
				goSupra();
				break;
			case STATE_OVRIGT:
				goOvrigt();
				break;
			case STATE_HABITAT:
				goHabitat();
				break;
			case STATE_TRÄD:
				goTräd();
				break;
			case STATE_DEPONI:
				goDeponi();
				break;
			case STATE_BUSKAR:
				goBuskar();
				break;
			case STATE_DRIFT:
				goDrift();
				break;
		}
	}


	protected void goDrift() {
		bg.removeAllViews();
		//Button
		Intent intent = new Intent(this, ActivityVallar.class);
		addButton(bg,"Driftvallar",intent);
	}


	protected void goBuskar() {
		bg.removeAllViews();

		//Klippamax
		addNormalInput(bg,"Busktäckning","Ange total busktäckning (%)",py.getBusktackning(),ID_Busktackning,InputType.TYPE_CLASS_NUMBER);

		//Button
		final Intent intent = new Intent(this,ActivityArterFaltskikt.class);
		intent.putExtra(Constants.KEY_CURRENT_TABLE, Constants.BUSKAR);
		addButton(bg,"Buskarter",intent);
	}
	protected void goDeponi() {
		bg.removeAllViews();
		if (deponiV == null) {
			FrameLayout deponiF;
			deponiV = LayoutInflater.from(this).inflate(R.layout.deponi, null);
			deponiF = (FrameLayout)deponiV.findViewById(R.id.deponiF);
			deponiF.removeAllViews();
			deponiF.addView(tableDeponi);
		}
		bg.addView(deponiV);

	}

	protected void goTräd() {
		bg.removeAllViews();

		//Trädförekomst
		entries = new ArrayList<String>(Arrays.asList("Trädlös","Enstaka träd","Skog (>0,25 ha)"));
		values = sequence(entries);
		addSpinnerInput(bg,"Trädförekomst","Trädförekomst på öar",py.getTradforekomst(),ID_Tradforekomst,entries,values);



		//Button
		final Intent intent = new Intent(this,ActivityArterFaltskikt.class);
		intent.putExtra(Constants.KEY_CURRENT_TABLE, Constants.TRÄD);
		addButton(bg,"Trädarter",intent);
	}


	protected void goHabitat() {
		bg.removeAllViews();
		//Kriteriestrand
		//addSpinnerInput(bg,"Kriterie strand","Vilka naturlighetskriterier har inte uppfyllts?",py.getKriteriestrand(),ID_KriterieStrand,entries,values);

		//Kriterieovan
		//use same entries & values as above.
		//addSpinnerInput(bg,"Kriterie ovan","Vilka naturlighetskriterier har inte uppfyllts?",py.getKriterieovan(),ID_KriterieOvan,entries,values);

		//BUTTONS
		addButton(bg,"Habitat",new Intent(this,ActivityHabitat.class));

	}



	protected void goOvrigt() {
		bg.removeAllViews();
		//Rekreation
		entries = rekreationsTyper;
		values = sequence(entries);
		addSpinnerInput(bg,"Rekreation","Eventuell markanvändning för rekreation",py.getRekreation(),ID_Rekreation,entries,values);

		//Röjning
		entries = new ArrayList<String>(Arrays.asList("Ingen avverking/röjning","kraftig utglesning av stora träd",
				"Svag utglesning av stora träd","kraftig utglesning av små träd",
				"kraftig utglesning av buskar","svag utglesning av buskar"));
		values = sequence(entries);
		addSpinnerInput(bg,"Röjning","Avverkning eller röjning i transekten?",py.getRojning(),ID_Rojning,entries,values);
		//Röjningstid
		entries = new ArrayList<String>(Arrays.asList("innevarande säsong","Föregående växtsäsong","2 år sedan","3-5 år sedan"));
		values = new ArrayList<String>(Arrays.asList("00","01","02","05"));
		addSpinnerInput(bg,"Röjningstid","Säsong för avverkning/röjning",py.getRojningtid(),ID_Rojningstid,entries,values);
		//Klippamax
		addNormalInput(bg,"Högsta klippan i transekten","Maximal höjd av klippa inom transekten (m)",py.getKlippamax(),ID_KlippaMax,InputType.TYPE_CLASS_NUMBER);
		//Stängsel
		addBooleanInput(bg,"Stängsel","Finns det något stängsel i transektens förlängning?",py.getStangsel(),ID_Stangsel);
	}

	protected void goSupra() {
		bg.removeAllViews();
		//Lutning 
		addNormalInput(bg,"Lutning Supralitoral","Ange grader (deg)",py.getLutningsupra(),ID_LutningSupra,InputType.TYPE_CLASS_NUMBER);
		//Marktyp supra
		entries = markTyper;
		values = markTypKoder;
		addSpinnerInput(bg,"Marktyp","Marktyp/markanvänding i supralitoralen",py.getMarktypsupra(),ID_MarktypSupra,entries,values);
		//Vägtäckningsfält
		addNormalInput(bg,"Total fältskiktstäckning","Total täckning av fältskiktet i Supralitoralen (%)",py.getVegtackningfaltsupra(),ID_VegtackningsfaltSupra,InputType.TYPE_CLASS_NUMBER);
		//Trädtäckning
		addNormalInput(bg,"Total trädtäckning Supralitoral","Total täckning av trädskiktet i Supralitoralen (%)",py.getTradtackningsupra(),ID_TradtackningSupra,InputType.TYPE_CLASS_NUMBER);
		//SlutLängd Supra
		addNormalInput(bg,"Supralitoral slutlängd","Ange zonens slut (m)",py.getSlutlensupra(),ID_SlutlenSupra,InputType.TYPE_NUMBER_FLAG_DECIMAL);
		//BUTTONS
		addButton(bg,"Substrat",new Intent(this,ActivitySubstratSelection.class));
		addButtonArter();
	}




	protected void goGeo() {
		bg.removeAllViews();
		//Lutning 
		addNormalInput(bg,"Lutning Geolitoral","Ange grader (deg)",py.getLutninggeo(),ID_LutningGeo,InputType.TYPE_CLASS_NUMBER);
		//Marktyp supra
		entries = markTyper;
		values = markTypKoder;
		addSpinnerInput(bg,"Marktyp","Marktyp/markanvänding i geolitoralen",py.getMarktypgeo(),ID_MarktypGeo,entries,values);
		//Vägtäckningsfält geo
		addNormalInput(bg,"Total fältskiktstäckning","Total täckning av fältskiktet i Geolitoralen (%)",py.getVegtackningfaltgeo(),ID_tacknfaltGeo,InputType.TYPE_CLASS_NUMBER);
		//Trädtäckning geo
		addNormalInput(bg,"Total trädtäckning","Total täckning av trädskiktet i Geolitoralen (%)",py.getTradtackninggeo(),ID_TradtackningGeo,InputType.TYPE_CLASS_NUMBER);
		//SlutLängd
		addNormalInput(bg,"Geolitoral slutlängd","Avstånd längs transekten från medelvattenlinjen till där geolittoralen slutar (m)",py.getSlutlengeo(),ID_SlutlenGeo,InputType.TYPE_NUMBER_FLAG_DECIMAL);
		//BUTTONS
		addButton(bg,"Substrat",new Intent(this,ActivitySubstratSelection.class));
		addButtonArter();
	}




	protected void goHydro() {
		bg.removeAllViews();
		//Brygga
		addBooleanInput(bg,"Brygga","Finns det någon brygga i transektens förlängning?",py.getBrygga(),ID_Brygga);
		//Vasslängd
		addNormalInput(bg,"Längd vassbälte","Längd av vassbälte längs transekten (meter)",py.getVasslen(),ID_Vasslen,InputType.TYPE_CLASS_NUMBER);
		//Vasslängd
		addNormalInput(bg,"Vasstäckning","Genomsnittlig täthet av vassbältet (%)",py.getVasstathet(),ID_Vasstathet,InputType.TYPE_CLASS_NUMBER);
		//Vågexponering
		entries = new ArrayList<String>(Arrays.asList("Ultraskyddat","Extremt skyddat","Mycket skyddat","Skyddat","Moderat exponerat","Exponerat","Mycket exponerat","Extremt exponerat"));
		values = sequence(entries);
		addSpinnerInput(bg,"Vågexponering","Bedöm exponeringklass. Jämför med utdata och ändra om det (uppenbart) ej stämmer",py.getExponering(),ID_VågExponering,entries,values);
		//Strandtyp
		List<String> values;// = new ArrayList<String>(Arrays.asList("1","2","3","4","5"));
		List<String> entries = new ArrayList<String>(Arrays.asList("Klippa/Häll","Block/Grus","Sand","Strandäng/Våtmark","Konstruerad"));
		values = sequence(entries);
		addSpinnerInput(bg,"Strandtyp","Bedöm dominerande strandtyp som finns direkt ovanför provytepunkten",py.getStrandtyp(),ID_Strandtyp,entries,values);
		//Kusttyp
		entries = new ArrayList<String>(Arrays.asList("fastland","öar (>2 ha)","skär (<2ha och >0,1ha)","grund (<0,1ha)"));
		values = sequence(entries);
		addSpinnerInput(bg,"Kusttyp","Ange om provytan ligger på:",py.getKusttyp(),ID_Kusttyp,entries,values);
		//Vattendjup
		addNormalInput(bg,"Vattendjup","Mätt vattendjup 3 m utanför medelvattenlinjen (dm)",py.getVattendjup(),ID_Vattendjup,InputType.TYPE_CLASS_NUMBER);
		//BUTTONS
//		addButton(bg,"Arter",new Intent(this,ActivitySelectArt.class));
		addButton(bg,"Substrat",new Intent(this,ActivitySubstratSelection.class));
	}

	protected void goExtra() {
		bg.removeAllViews();
		//Lutning
		addNormalInput(bg,"Lutning Extralitoral","Ange grader (deg)",py.getLutningextra(),ID_LutningExtra,InputType.TYPE_CLASS_NUMBER);
		//Marktyp extra
		entries = markTyper;
		values = markTypKoder;
		addSpinnerInput(bg,"Marktyp","Marktyp/markanvänding i extralitoralen",py.getMarktypextra(),ID_MarktypExtra,entries,values);
		//Vägtäckningfältextra
		addNormalInput(bg,"Total fältskiktstäckning","Total täckning av fältskiktet i Extralitoralen (%)",py.getVegtackningfaltextra(),ID_VegtackningExtra,InputType.TYPE_CLASS_NUMBER);
		//Trädtäckning Extra
		addNormalInput(bg,"Trädtäckning Extralitoral","Total täckning av trädskiktet i Extralitoralen (%)",py.getTradtackningextra(),ID_TradtackningExtra,InputType.TYPE_CLASS_NUMBER);
		//SlutLängd Extralitoral
		addNormalInput(bg,"Extralitoral slutlängd","Ange metertal där Extralitoralen slutar (m)",py.getSlutlenovan(),ID_SlutlenOvan,InputType.TYPE_NUMBER_FLAG_DECIMAL);
		//BUTTONS
		addButton(bg,"Substrat",new Intent(this,ActivitySubstratSelection.class));
		addButtonArter();
	}


	private void addButtonArter() {
		final Intent intent = new Intent(this,ActivitySelectArt.class);
		intent.putExtra(Constants.KEY_CURRENT_TABLE, -1);
		addButton(bg,"Arter",intent);
	}


	public TextView getTextView(View v) {
		return (TextView)v.findViewById(R.id.editfieldinput);
	}

	private View createClickableField(ViewGroup bg,String headerT,String defValue) {
		return createClickableField(bg,headerT,defValue,R.layout.clickable_field_normal);
	}
	private View createClickableListField(ViewGroup bg,String headerT,String defValue) {
		return createClickableField(bg,headerT,defValue,R.layout.clickable_field_list);
	}
	private View createClickableYesNoField(ViewGroup bg,String headerT,String defValue) {
		return createClickableField(bg,headerT,defValue,R.layout.clickable_field_yes_no);
	}

	private View createClickableField(ViewGroup bg,String headerT,String defValue, int res) {
		View view = LayoutInflater.from(getBaseContext()).inflate(res,null);
		bg.addView(view);
		TextView header = (TextView)view.findViewById(R.id.editfieldtext);
		SpannableString content = new SpannableString(headerT);
		content.setSpan(new UnderlineSpan(), 0, content.length(), 0);
		header.setText(content);
		getTextView(view).setText(defValue);
		view.setClickable(true);
		return view;
	}



	private View addBooleanInput(ViewGroup bg,final String headerT,final String bodyT,final String currValue,final int id) {
		final View v = createClickableYesNoField(bg,headerT,currValue);

		final AlertBuildHelper abh = new AlertBuildHelper(getBaseContext()) {
			@Override
			public View createView() {
				// Set an EditText view to get user input 
				View view = LayoutInflater.from(c).inflate(R.layout.ja_nej_radiogroup,null);
				RadioButton ja = (RadioButton)view.findViewById(R.id.ja);
				RadioButton nej = (RadioButton)view.findViewById(R.id.nej);
				if(currValue!=null) {
					if(currValue.equals("1"))
						ja.setEnabled(true);
					else
						nej.setEnabled(true);
					ja.setChecked(true);
				}
				return view;
			}
			@Override
			public void setResult(int id, View inputView,View outputView) {
				setStringValue(id,((RadioButton)inputView.findViewById(R.id.ja)).isChecked()?"1":"0",outputView);
			}};

		v.setOnClickListener(InputAlertBuilder.createAlert(id,headerT,bodyT,abh,v));
		return v;

	}

	private View addSpinnerInput(ViewGroup bg,final String headerT,final String bodyT,final String currValue,final int id, final List<String>entries, final List<String>values) {

		final View v = createClickableListField(bg,headerT,currValue);

		final AlertBuildHelper abh = new AlertBuildHelper(getBaseContext()) {
			@Override
			public View createView() {
				// Set an EditText view to get user input 
				final Spinner spinner = (Spinner)LayoutInflater.from(c).inflate(R.layout.edit_field_spinner, null);
				ArrayAdapter<String> adapter = new ArrayAdapter<String>(c, android.R.layout.simple_spinner_dropdown_item, entries);
				spinner.setAdapter(adapter);

				return spinner;
			}
			@Override
			public void setResult(int id, View inputView,View outputView) {
				int selPos = ((Spinner)inputView).getSelectedItemPosition();
				Log.d("Strand","Value for spinner: "+values.get(selPos));
				setStringValue(id,values.get(selPos)+"  "+entries.get(selPos),outputView);
			}};


		v.setOnClickListener(InputAlertBuilder.createAlert(id,headerT,bodyT,abh,v));
		return v;
	}

	private View addNormalInput(ViewGroup bg,final String headerT,final String bodyT,final String currValue, final int id, final int inputType) {
		final View v = createClickableField(bg, headerT,currValue);
		final TextView et = (TextView)v.findViewById(R.id.editfieldinput);
		final InputAlertBuilder.AlertBuildHelper abh = new AlertBuildHelper(this.getBaseContext()) {
			@Override
			public View createView() {
				// Set an EditText view to get user input 

				int typeId = (inputType ==InputType.TYPE_CLASS_NUMBER)?R.layout.edit_field:R.layout.edit_field_komma;
				final EditText input = (EditText)LayoutInflater.from(c).inflate(typeId, null);

				input.setText(et.getText());
				//input.setInputType(inputType);

				return input;
			}

			@Override
			public void setResult(int id,View inputView,View outputView) {
				setStringValue(id,((EditText)inputView).getText().toString(),outputView);
			}};

		v.setOnClickListener(InputAlertBuilder.createAlert(id,headerT,bodyT,abh,v));

		return v;

	}



	private void addButton(LinearLayout bg, String text,final Intent intent) {
		Button b = new Button(this);
		b.setText(text);
		LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT,LayoutParams.WRAP_CONTENT);
		b.setLayoutParams(params);
		b.setOnClickListener(new OnClickListener() {

			@Override
			public void onClick(View arg0) {
				ActivityZoneSplit.this.startActivity(intent);
			}});
		bg.addView(b);
	}


	private List<String> sequence(List<String>in) {
		List<String> ret = new ArrayList<String> ();
		int i = 1;
		for (String x:in)
			ret.add(Integer.toString(i++));
		return ret;
	}


	private void setStringValue(int id, String value, View v) {
		switch(id) {
			case ID_SlutlenOvan:
				py.setSlutlenovan(value);
				break;

			case ID_SlutlenGeo:
				py.setSlutlengeo(value);
				break;
			case ID_Strandtyp:
				py.setStrandtyp(value);
				break;

			case ID_Kusttyp:
				py.setKusttyp(value);
				break;

			case ID_Tradforekomst:
				py.setTradforekomst(value);
				break;

			case ID_VågExponering:
				py.setExponering(value);
				break;

			case ID_SlutlenSupra:
				py.setSlutlensupra(value);
				break;

			case ID_LutningGeo:
				py.setLutninggeo(value);
				break;
			case ID_LutningSupra:
				py.setLutningsupra(value);
				break;
			case ID_LutningExtra:
				py.setLutningextra(value);
				break;
			case ID_Vattendjup:
				py.setVattendjup(value);
				break;
			case ID_Brygga:
				py.setBrygga(value);
				break;
			case ID_Vasslen:
				py.setVasslen(value);
				break;
			case ID_Vasstathet:
				py.setVasstathet(value);
				break;
			case ID_MarktypSupra:
				py.setMarktypsupra(value);
				break;

			case ID_VegtackningsfaltSupra:
				py.setVegtackningfaltsupra(value);
				break;

			case ID_TradtackningSupra:
				py.setTradtackningsupra(value);
				break;

			case ID_MarktypGeo:
				py.setMarktypgeo(value);
				break;

			case ID_tacknfaltGeo:
				py.setVegtackningfaltgeo(value);
				break;

			case ID_TradtackningGeo:
				py.setTradtackninggeo(value);
				break;

			case ID_MarktypExtra:
				py.setMarktypextra(value);
				break;

			case ID_VegtackningExtra:
				py.setVegtackningfaltextra(value);
				break;

			case ID_TradtackningExtra:
				py.setTradtackningextra(value);
				break;
			case ID_Rekreation:
				py.setRekreation(value);
				break;

			case ID_Rojning:
				py.setRojning(value);
				break;
			case ID_Rojningstid:
				py.setRojningtid(value);
				break;

			case ID_KlippaMax:
				py.setKlippamax(value);
				break;

			case ID_Stangsel:
				py.setStangsel(value);
				break;

			case ID_Busktackning:
				py.setBusktackning(value);
				break;

		}
		getTextView(v).setText(value);

	}



	@Override
	public void onSaveInstanceState(Bundle savedInstanceState) {
		savedInstanceState.putInt(Constants.KEY_ZONE_DISPLAY_STATE, myDisplayState);
		Log.d("Strand","onsaveinstance called");
		super.onSaveInstanceState(savedInstanceState);
	}




}
