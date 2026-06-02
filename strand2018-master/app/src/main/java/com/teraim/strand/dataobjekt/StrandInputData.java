package com.teraim.strand.dataobjekt;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

import android.util.Log;

/**
 * 
 * @author Terje
 *
 * Det här objektet enkapsulerar den CSV inputfil som finns för Strand.
 * 
 */

public class StrandInputData {
	
	private static List<Entry> myTable = new ArrayList<Entry>();
	private final static int ColumnCount = 15;	
	//internal row counter used for error message.

	
	//Fetches and parses the input file data. For now, this is stored as a dev. file.
	public static boolean parseInputFile(InputStream is) {
		//If already parsed, don't do it again..
		if (myTable.size()!=0) 
			return true;
		 BufferedReader bufferreader = new BufferedReader(new
		            InputStreamReader(is));
		    String bufferLine;
		    int row=1;
		    try{
			    //Discard first row
			    bufferLine = bufferreader.readLine();			    
		        while ((bufferLine = bufferreader.readLine()) != null){
		            addRow(bufferLine,row++);
		             }
		            } catch (IOException e){
		            	return false;
		            }
		    Log.e("Strand", "File ok. Read "+row+" rows");
		    return true;
	}
	
	private static void addRow(String row, int x) {

		assert(row!=null);
		String[] c = row.split(",");
		//TODO: Add lat, long
		if (c.length!=ColumnCount) {
			Log.e("Strand", "Wrong number of column in input row "+x+" :"+c.length);
			
		}
		//Skip header...
		myTable.add(new Entry(c[0],c[1],c[2],c[3],c[4],c[5],c[6],c[7],c[8],c[9],c[10],c[11],c[12],c[13],c[14]));
	}
	
	
	public static List<Entry> getEntries() {
		return myTable;
	}
	
	public static class Entry {
		
		private String pyid,ruta,provyta,vattendistrikt,namn,urvalsklass,strandtyp,kusttyp,vågexponering,transketlangd,transektriktning,east,north,longitude,latitude;

		public Entry(String ruta, String vattendistrikt,String namn,
				String strandtyp,String kusttyp,String urvalsklass,
				String provyta,String pyid, String vågexponering,
				String transketlangd,String transektriktning,
				String east, String north,String longitude, String latitude) {
			super();
			this.pyid = pyid;
			this.ruta = ruta;
			this.provyta = provyta;
			this.vattendistrikt = vattendistrikt;
			this.namn = namn;
			this.urvalsklass = urvalsklass;
			this.strandtyp = strandtyp;
			this.kusttyp = kusttyp;
			this.vågexponering = vågexponering;
			this.transketlangd = transketlangd;
			this.transektriktning = transektriktning;
			this.east = east;
			this.north = north;
			this.longitude = longitude;
			this.latitude = latitude;
		}

		public String getPyid() {
			return pyid;
		}


		public String getRuta() {
			return ruta;
		}

		public String getProvyta() {
			return provyta;
		}

		public String getVattendistrikt() {
			return vattendistrikt;
		}

		public String getNamn() {
			return namn;
		}


		public String getUrvalsklass() {
			return urvalsklass;
		}


		public String getStrandtyp() {
			return strandtyp;
		}

		public String getKusttyp() {
			return kusttyp;
		}

		public String getVågexponering() {
			return vågexponering;
		}

		public String getTransketlangd() {
			return transketlangd;
		}

		public String getTransektriktning() {
			return transektriktning;
		}

		public String getEast() {
			return east;
		}

		public String getNorth() {
			return north;
		}

		public String getLongitude() {
			return longitude;
		}

		public String getLatitude() {
			return latitude;
		}



		
	}
	
	
}
