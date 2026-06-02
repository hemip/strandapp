package com.teraim.strand.exporter;

import java.io.IOException;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import android.util.JsonWriter;
import android.util.Log;

import com.teraim.strand.Provyta;
import com.teraim.strand.dataobjekt.Table;


public class JSONify {
	
	public class JSON_Report {
		public JSON_Report(List<String> badApples, String j) {
			empty=badApples;
			json=j;
		}
		public List<String> empty;
		public String json;
	}
	
	JsonWriter writer;
	
	//Variables that can be empty.
	private String[] excludeList = {"blalapp"};
	//Returns JSONified String version of provyta.
	public JSON_Report normal(Provyta py) throws IOException {
//		File file = new File(Persistent.DATA_ROOT_DIR+"test.txt");
//		writer = new JsonWriter(new OutputStreamWriter(new FileOutputStream(file), "UTF-8"));
		StringWriter out = writeHeader(py);
		
		write("brygga",py.getBrygga());		
		write("busktackning",py.getBusktackning());		
		write("dynerBlottadSand",py.getDynerblottadsand());		
		write("exponering",py.getExponering());	
		write("gpseast",py.getGpseast());		
		write("gpsnorth",py.getGpsnorth());		
		write("inventeringstyp",py.getInventeringstyp());		

		write("orsak",py.getOrsak());
		write("kriteriestrand",py.getKriteriestrand());		
		write("kriterieovan",py.getKriterieovan());
		write("klippamax",py.getKlippamax());
		write("kusttyp",py.getKusttyp());		
		write("lutningextra",py.getLutningextra());
		write("lutninggeo",py.getLutninggeo());
		write("lutningsupra",py.getLutningsupra());
		write("marktypextra",py.getMarktypextra());
		write("marktypgeo",py.getMarktypgeo());
		write("marktypsupra",py.getMarktypsupra());
		write("marktypovan",py.getMarktypovan());			
		write("ovanhabitat",py.getOvanHabitat());
		write("rekreation",py.getRekreation());
		write("rojning",py.getRojning());
		write("rojningtid",py.getRojningtid());
		write("riktning",py.getRiktning());		
		write("slutlengeo",py.getSlutlengeo());
		write("slutlensupra",py.getSlutlensupra());
		write("slutlenovan",py.getSlutlenovan());
		write("strandtyp",py.getStrandtyp());
		write("stangsel",py.getStangsel());	
		write("tradforekomst",py.getTradforekomst());
		write("tradtackninggeo",py.getTradtackninggeo());
		write("tradtackningsupra",py.getTradtackningsupra());
		write("tradtackningextra",py.getTradtackningextra());
		write("vegtackningfaltgeo",py.getVegtackningfaltgeo());		
		write("vegtackningfaltsupra",py.getVegtackningfaltsupra());
		write("vegtackningfaltextra",py.getVegtackningfaltextra());
		write("vasslen",py.getVasslen());
		write("vattendjup",py.getVattendjup());
		write("vasstathet",py.getVasstathet());

		writeArrays(py);

		return generateReport(out);

	}

	private void writeArrays(Provyta py) throws IOException {

		Log.d("p","Writing tables");

		Log.d("p","Arter:");
		writer.name("Arter");
		writeArray(py.getArter());

		Log.d("p","Buskar:");
		writer.name("Buskar");
		writeArray(py.getBuskar());

        Log.d("p","Habitat:");
		writer.name("Habitat");
        writeArray(py.getHabitat());

        Log.d("p","Dyner:");
		writer.name("Dyner");
        writeArray(py.getDyner());

		Log.d("p","Deponi:");
		writer.name("Deponi");
        writeArray(py.getDeponi());

        Log.d("p","Träd:");
        writer.name("Trad");
        writeArray(py.getTräd());

        Log.d("p","Vallar:");
        writer.name("Vallar");
        writeArray(py.getVallar());

		Log.d("p","ExtraImages:");
		writer.name("ExtraImages");
		writeArray(py.getExtraImages());

		String subs[][] = py.getSubstrat();

		if (subs!=null) {
			Log.d("p","Substrat");
			writer.name("Substrat");

			Log.d("vortex","creating substrat");
			writer.beginArray();
			for (String[] row: subs) {
				if (row!=null) {
					writer.beginArray();
					for (String e:row) {
						writer.value(e);
					}
					writer.endArray();
				}
			}
			writer.endArray();

		}
	}

	private void writeArray(Table t) throws IOException {
		Set<Map.Entry<String, String[]>> rows = t.getTable();
		int i = 0;
		writer.beginArray();
		if (rows!=null) {
			for (Map.Entry<String, String[]> row : rows) {
				writer.beginArray();
				//Log.d("v", "r:" + (i++) + "key" + row.getKey() + " val:" + Arrays.toString(row.getValue()));
				if (row.getValue() == null) {
					Log.e("p","null");
					continue;
				}
				for (String e : row.getValue()) {
					writer.value(e);
					Log.e("p","array val: "+e);
				}
				writer.endArray();
			}
		}
		writer.endArray();
	}

	private JSON_Report generateReport(StringWriter out) throws IOException {
		writer.endObject();		
		writer.close();		
		return new JSON_Report(badApples,out.toString());
	}
	
	public JSON_Report noInput(Provyta py) throws IOException {
		StringWriter out = writeHeader(py);		
		write("orsak",py.getOrsak());	
		return generateReport(out);
	}
	
	private List<String> badApples = null;
	
	private void write(String name,String value) throws IOException {
		
		String val = (value==null||value.length()==0)?"NULL":value;
		writer.name(name).value(val);
		if (val.equals("NULL") && !nameOnExludeList(name)) 
			badApples.add(name);	
		else
			Log.d("Strand","found value "+value+" for "+name);
	}

	
	private boolean nameOnExludeList(String name) {
		for(int i=0;i<excludeList.length;i++)
			if (name.equals(excludeList[i]))
				return true;
			
		return false;
	}

	public List<String> getBadApples() {
		return badApples;
	}
	
	private StringWriter writeHeader(Provyta py) throws IOException {
		StringWriter sw = new StringWriter();
		badApples=new ArrayList<String>();
		writer = new JsonWriter(sw);
		writer.setIndent("  ");
		writer.beginObject();
		Log.d("Strand","Writing Provyta "+py.getpyID());
		write("pyID",py.getpyID());
		write("lagnummer",py.getLagnummer());	
		write("inventerare",py.getInventerare());				
		write("ruta",py.getRuta());
		write("provyta",py.getProvyta());
		//BORTTAGNA I VERSION 2017.01
		write("matstart", new SimpleDateFormat("yyyy-MM-dd").format(py.getMätstart()));



		write("blalapp",py.getBlålapp().toString());
		return sw;
	}
}
